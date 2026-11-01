
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BluetoothSerial.h>

// Bluetooth Classic is supported on compatible ESP32 boards.
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error "Bluetooth is not enabled. Select a compatible ESP32 board."
#endif

BluetoothSerial SerialBT;

// ---------------- PIN DEFINITIONS ----------------
#define DHT_PIN 4
#define DHT_TYPE DHT22

#define RAIN_PIN 34

#define TRIG_PIN 5
#define ECHO_PIN 18

#define LED_PIN 23

// ---------------- LCD CONFIGURATION ----------------
#define LCD_ADDR 0x27
#define LCD_COLS 16
#define LCD_ROWS 2

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
DHT dht(DHT_PIN, DHT_TYPE);

// ---------------- CALIBRATION ----------------
const int RAIN_DRY = 3800;
const int RAIN_WET = 1500;

const float TANK_HEIGHT_CM = 30.0;
const float FULL_DISTANCE_CM = 3.0;
const float MAX_MODEL_WATER_LEVEL_M = 10.0;

// ---------------- TIMING ----------------
const unsigned long READ_INTERVAL = 2000;
unsigned long previousMillis = 0;

bool lcdScreenToggle = false;

// LED starts OFF until a prediction command is received.
bool floodLedOn = false;

// ---------------- BLUETOOTH COMMAND HANDLER ----------------
// Laptop sends LED_ON or LED_OFF, followed by a newline.
// ESP32 executes command, reads real hardware pin state, and sends ACK over SerialBT.
void handleBluetoothCommands() {
  static String command = "";

  while (SerialBT.available() > 0) {
    char c = (char)SerialBT.read();

    if (c == '\n' || c == '\r') {
      command.trim();

      if (command == "LED_ON") {
        digitalWrite(LED_PIN, HIGH);
        int pinState = digitalRead(LED_PIN);
        floodLedOn = (pinState == HIGH);
        SerialBT.printf("{\"ack\":\"LED_ON\",\"gpio\":%d,\"state\":%d}\n", LED_PIN, pinState);
        Serial.printf("[LED] ON - GPIO %d verified state: %d (Laptop FLOOD)\n", LED_PIN, pinState);
      }
      else if (command == "LED_OFF") {
        digitalWrite(LED_PIN, LOW);
        int pinState = digitalRead(LED_PIN);
        floodLedOn = (pinState == HIGH);
        SerialBT.printf("{\"ack\":\"LED_OFF\",\"gpio\":%d,\"state\":%d}\n", LED_PIN, pinState);
        Serial.printf("[LED] OFF - GPIO %d verified state: %d (Laptop NO FLOOD)\n", LED_PIN, pinState);
      }

      command = "";
    }
    else if (command.length() < 30) {
      command += c;
    }
  }
}

// ---------------- ULTRASONIC DISTANCE ----------------
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1;
  }

  return (duration * 0.0343) / 2.0;
}

// ---------------- WATER LEVEL ----------------
int calculateWaterLevel(float distance) {
  if (distance < 0) {
    return -1;
  }

  if (distance >= TANK_HEIGHT_CM) {
    return 0;
  }

  if (distance <= FULL_DISTANCE_CM) {
    return 100;
  }

  float level =
    ((TANK_HEIGHT_CM - distance) /
     (TANK_HEIGHT_CM - FULL_DISTANCE_CM)) * 100.0;

  return constrain((int)level, 0, 100);
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println(" FLOODGUARD ESP32");
  Serial.println(" Sensors + Bluetooth + LED");
  Serial.println("==================================");

  // Bluetooth device name
  if (!SerialBT.begin("FloodGuard_ESP32")) {
    Serial.println("[BT] ERROR: Bluetooth initialization failed!");
  }
  else {
    Serial.println("[BT] Bluetooth ready: FloodGuard_ESP32");
  }

  // LED configuration
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // LCD configuration
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("FLOODGUARD");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  // Sensor configuration
  dht.begin();

  pinMode(RAIN_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);

  delay(1500);
  lcd.clear();

  Serial.println("[SYSTEM] Ready");
  Serial.println("[LED] Waiting for laptop prediction");
}

// ---------------- MAIN LOOP ----------------
void loop() {
  // Always check for commands from the laptop.
  handleBluetoothCommands();

  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis < READ_INTERVAL) {
    return;
  }

  previousMillis = currentMillis;

  // 1. Temperature and humidity
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[DHT] ERROR - Check sensor wiring");

    lcd.setCursor(0, 0);
    lcd.print("ERR: DHT SENSOR ");
    lcd.setCursor(0, 1);
    lcd.print("Check Wiring!   ");

    return;
  }

  // 2. Rain sensor
  int rainRaw = analogRead(RAIN_PIN);

  int rainPercent = map(
    constrain(rainRaw, RAIN_WET, RAIN_DRY),
    RAIN_DRY,
    RAIN_WET,
    0,
    100
  );

  String rainStatus;

  if (rainPercent < 10) {
    rainStatus = "CLEAR";
  }
  else if (rainPercent < 40) {
    rainStatus = "LIGHT";
  }
  else if (rainPercent < 70) {
    rainStatus = "MOD";
  }
  else {
    rainStatus = "HEAVY";
  }

  // 3. Water level
  float distance = readDistanceCM();
  int waterPercent = calculateWaterLevel(distance);

  if (waterPercent < 0) {
    Serial.println("[ULTRASONIC] ERROR - No echo");

    lcd.setCursor(0, 0);
    lcd.print("ERR: ULTRASONIC ");
    lcd.setCursor(0, 1);
    lcd.print("No Echo Signal  ");

    return;
  }

  // 4. Local risk score for LCD display only.
  // This is NOT the laptop's ML prediction.
  float waterScore = waterPercent * 0.50;
  float rainScore = rainPercent * 0.35;
  float humidityScore = humidity * 0.15;

  float floodRisk = waterScore + rainScore + humidityScore;
  floodRisk = constrain(floodRisk, 0, 100);

  String floodStatus;
  String lcdRiskTag;

  if (floodRisk < 25) {
    floodStatus = "SAFE";
    lcdRiskTag = "SAFE ";
  }
  else if (floodRisk < 50) {
    floodStatus = "LOW RISK";
    lcdRiskTag = "LOW  ";
  }
  else if (floodRisk < 75) {
    floodStatus = "MODERATE RISK";
    lcdRiskTag = "MOD  ";
  }
  else {
    floodStatus = "HIGH FLOOD RISK";
    lcdRiskTag = "HIGH!";
  }

  // 5. Prepare sensor values for the backend.
  // These conversions retain your original project mapping.
  float rainfall_val = (float)rainPercent;
  float water_level_val =
    ((float)waterPercent / 100.0) * MAX_MODEL_WATER_LEVEL_M;

  // 6. Send sensor readings to laptop over Bluetooth (includes verified physical GPIO 23 state).
  char jsonBuffer[180];

  snprintf(
    jsonBuffer,
    sizeof(jsonBuffer),
    "{\"temperature\":%.1f,\"humidity\":%.1f,"
    "\"rainfall\":%.1f,\"water_level\":%.2f,\"led\":%d}",
    temperature,
    humidity,
    rainfall_val,
    water_level_val,
    digitalRead(LED_PIN)
  );

  SerialBT.println(jsonBuffer);

  // 7. USB Serial debug information
  Serial.println();
  Serial.println("========== FLOODGUARD ==========");
  Serial.printf("Temperature : %.1f C\n", temperature);
  Serial.printf("Humidity    : %.1f %%\n", humidity);
  Serial.printf("Rain        : %d %% (%s)\n",
                rainPercent, rainStatus.c_str());
  Serial.printf("Water level : %d %%\n", waterPercent);
  Serial.printf("Local score : %.1f %%\n", floodRisk);
  Serial.printf("Local status: %s\n", floodStatus.c_str());
  Serial.printf("Laptop LED  : %s\n",
                floodLedOn ? "ON" : "OFF");
  Serial.printf("[BT SENT]   : %s\n", jsonBuffer);
  Serial.println("================================");

  // 8. LCD display
  char line1[17];
  char line2[17];

  if (!lcdScreenToggle) {
    snprintf(
      line1, sizeof(line1),
      "Risk:%3.0f%% [%s]", floodRisk, lcdRiskTag.c_str()
    );

    snprintf(
      line2, sizeof(line2),
      "W:%3d%% Rain:%-5s", waterPercent, rainStatus.c_str()
    );
  }
  else {
    snprintf(line1, sizeof(line1), "Temp : %5.1f C", temperature);
    snprintf(line2, sizeof(line2), "Humid: %5.1f %%", humidity);
  }

  lcdScreenToggle = !lcdScreenToggle;

  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}
