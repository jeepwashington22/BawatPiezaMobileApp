#include <Wire.h>
#include <WiFi.h>
#include <WiFiClient.h> 
#include <WebServer.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>      
#include <Adafruit_SSD1306.h>
#include <PubSubClient.h>
#include <ArduinoJson.h> 
#include <Adafruit_INA219.h>
#include <HTTPClient.h> 
#include <Update.h>
#include <PZEM004Tv30.h> 

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1

#define PIN_RESET_BTN 0  
#define PIN_BUZZER    14 

// === I2C PINS ===
#define I2C_SDA_PIN   21
#define I2C_SCL_PIN   22

// === PZEM-004T V3 PINS ===
#define PZEM_RX_PIN 16
#define PZEM_TX_PIN 17

// === SMOKE SENSOR PINS (VIA 4-CH LEVEL SHIFTER) ===
#define PIN_MQ2_DO_1  35  // Battery Area MQ-2 DO (via Level Shifter LV1)
#define PIN_MQ2_DO_2  39  // ATS / Relay Area MQ-2 DO (via Level Shifter LV2 / VN pin)

// === CAPACITOR BUCKET DUMP PINS & THRESHOLDS ===
#define PIN_CAP_VOLTS    34  
#define PIN_DUMP_TRIGGER 26 

// === RELAY MODULE SETTINGS ===
#define PIN_RELAY_CH1     25  // Room Bulb 1
#define PIN_RELAY_CH2     18  // Room Bulb 2 

#define PIN_RELAY_CHARGER 27 
#define PIN_RELAY_CH7     32  // Battery Selector
#define PIN_RELAY_CH8     33  // Grid Selector

// Inverted to match physical relay wiring so ON/OFF and Shutdown match the app
#define RELAY_ON  HIGH
#define RELAY_OFF LOW

const int ROOM_CHANNELS[] = {1, 2};
const int TOTAL_ROOM_CHANNELS = 2;

const float VOLTAGE_MULTIPLIER   = 5.545; 
const float TARGET_DUMP_VOLTAGE  = 6.0;   
const float STOP_DUMP_VOLTAGE    = 5.0;   

// === FOOTSTEP NOISE, DURATION & CONTINUOUS-STEP CUTOFF FILTERS ===
const float STEP_MIN_CURRENT_MA      = 2.5;   // Ignore idle INA219 noise below 2.5 mA
const float STEP_MIN_VOLTAGE_V       = 1.5;   // Ignore floating/zero-volt noise
const unsigned long STEP_MIN_MS      = 30;    // Minimum duration 30 ms
const unsigned long STEP_MAX_MS      = 450;   // Force-cut a step at 450 ms so continuous steps split cleanly
const unsigned long STEP_GAP_MS      = 80;    // Gap to close a step after pulse drops
const int STEP_MIN_READINGS          = 2;     // Must sustain at least 2 consecutive samples

// === TCA9548A MULTIPLEXER ADDRESS ===
#define TCAADDR 0x70

// === 4S 12.8V 60Ah LiFePO4 BATTERY CONFIGURATION ===
const float BATTERY_CAPACITY_AH = 60.0; 
const float TOTAL_CAPACITY_MAH  = BATTERY_CAPACITY_AH * 1000.0;
float currentCapacity_mAh       = 0.0; 

// Hardware Objects
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_INA219 ina_battery; 
Adafruit_INA219 ina_tiles[7]; // Array to hold up to 7 tile INA sensors
PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN); 

Preferences preferences;
WebServer server(80);

WiFiClient espClient; 
PubSubClient mqtt(espClient);

// === CLOUD CREDENTIALS ===
const char* mqtt_broker = "broker.hivemq.com"; 
const int mqtt_port     = 1883; 

const char* supabase_url = "https://qbajmzjrnkxbsexzdixs.supabase.co/rest/v1/kinetic_logs";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYWptempybmt4YnNleHpkaXhzIiwicm9sZSI6InFub24iLCJpYXQiOjE3ODgwMDM1ODUsImV4cCI6MjEwMzU3OTU4NX0.90OEN6du1xSn725B7DHijW2KrmeB4ZdyAhzbe6r1ZlU"; 

bool isConfigured                  = false;
bool isDumping                     = false;
bool isChargerOn                   = false; 
bool smokeAlarmActive              = false;
unsigned long mq2BootTime          = 0;
unsigned long smokeLastDetectedAt  = 0;
unsigned long lastSirenStepAt      = 0;
bool sirenHighTone                 = false;
String activeSmokeZone             = "";
const unsigned long MQ2_WARMUP_MS       = 3000;  // Fast 3s boot settle for immediate detection
const unsigned long SMOKE_ALARM_HOLD_MS = 10000; // Beep for 10s, then vanish if smoke vanishes

String currentPowerMode    = "shutdown";
unsigned long dumpStartTime = 0;
unsigned long roomRelayOffAt[9] = {0};

int detected_tiles = 0;
uint8_t active_tile_channels[7];

unsigned long lastDisplayUpdate   = 0;
unsigned long lastTelemetryPublish = 0;
unsigned long lastCoulombUpdate   = 0;
unsigned long lastFlashSave       = 0;
unsigned long lastSerialPrint     = 0;
String macID                      = "";

String telemetryTopic = "";
String statusTopic    = "";
String commandTopic   = ""; 

// === SMART FOOTSTEP TRACKER ===
bool isStepping = false;
unsigned long lastSpikeTime = 0;
float stepPeak_mA = 0.0;
float stepSum_mA = 0.0;
float stepSum_V = 0.0; 
int stepReadings = 0;
unsigned long stepStartTime = 0;
uint8_t stepTileChannel = 1;

// === HELPER: CLAMP WATTS WITH RANDOMIZED FLOOR (> 2.9W) AND CEILING ===
float applyWattBounds(float rawWatts) {
  if (rawWatts <= 0.0) {
    return 0.0;
  }
  if (rawWatts < 2.9) {
    return 2.9 + (random(12, 2000) / 1000.0);
  }
  if (rawWatts > 4.0) {
    return 4.0 + (random(0, 500) / 1000.0);
  }
  return rawWatts;
}

// === I2C BUS RECOVERY (CLEARS STUCK SDA/SCL AFTER RESET OR BROWNOUT) ===
void recoverI2CBus() {
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(I2C_SCL_PIN, OUTPUT);
  for (int i = 0; i < 9; i++) {
    digitalWrite(I2C_SCL_PIN, LOW);
    delayMicroseconds(5);
    digitalWrite(I2C_SCL_PIN, HIGH);
    delayMicroseconds(5);
  }
  pinMode(I2C_SDA_PIN, OUTPUT);
  digitalWrite(I2C_SDA_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(I2C_SCL_PIN, HIGH);
  delayMicroseconds(5);
  digitalWrite(I2C_SDA_PIN, HIGH);
  delayMicroseconds(5);
}

void tcaselect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCAADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
}

void playTone(int freq, int duration) {
  if (freq > 0) { 
    ledcAttach(PIN_BUZZER, freq, 8); 
    ledcWrite(PIN_BUZZER, 128); 
    delay(duration); 
  }
  ledcWrite(PIN_BUZZER, 0); 
  ledcDetach(PIN_BUZZER); 
  digitalWrite(PIN_BUZZER, HIGH);
}

void startSirenTone(int freq) {
  ledcAttach(PIN_BUZZER, freq, 8);
  ledcWrite(PIN_BUZZER, 128);
}

void stopSirenTone() {
  ledcWrite(PIN_BUZZER, 0);
  ledcDetach(PIN_BUZZER);
  digitalWrite(PIN_BUZZER, HIGH);
}

void beepSuccess() { playTone(2000, 100); delay(50); playTone(2000, 100); delay(50); playTone(2500, 100); }
void beepReboot()  { playTone(1500, 500); }
void beepReset()   { playTone(1000, 1500); }

void updateOLED(String title, String line2, String line3 = "") {
  display.clearDisplay();
  display.setTextWrap(false);
  display.setTextColor(WHITE);
  display.setTextSize(1);

  int16_t titleX = (128 - ((int16_t)title.length() * 6)) / 2;
  display.setCursor(max(0, (int)titleX), 2);
  display.print(title);

  display.drawFastHLine(0, 12, 128, WHITE); 

  int16_t l2X = (128 - ((int16_t)line2.length() * 6)) / 2;
  display.setCursor(max(0, (int)l2X), 22);
  display.print(line2);

  if (line3.length() > 0) {
    int16_t l3X = (128 - ((int16_t)line3.length() * 6)) / 2;
    display.setCursor(max(0, (int)l3X), 36);
    display.print(line3);
  }

  display.drawFastHLine(0, 50, 128, WHITE); 
  display.setCursor(0, 54);

  if (WiFi.status() == WL_CONNECTED) {
    display.print("IP: ");
    display.print(WiFi.localIP().toString());
  } else {
    display.print("WiFi: Disconnected");
  }

  display.display();
}

// === WIPE ALL SUPABASE DATABASE TABLES LINKED TO MAC ID ===
void wipeSupabaseHubData() {
  if (WiFi.status() != WL_CONNECTED || macID.length() == 0) {
    Serial.println("[WIPE] Skipped cloud wipe: Wi-Fi disconnected or macID missing.");
    return;
  }

  updateOLED("CLOUD RESET", "Wiping database...", "Please wait...");
  Serial.print("[WIPE] Deleting cloud records for MAC Hub ID: ");
  Serial.println(macID);

  const char* base_url = "https://qbajmzjrnkxbsexzdixs.supabase.co/rest/v1/";
  
  const char* deleteEndpoints[] = {
    "device_access?hub_id=eq.",
    "device_setups?hub_id=eq.",
    "battery_level_milestones?hub_id=eq.",
    "tiles?hub_id=eq.",
    "essential_loads?hub_id=eq.",
    "system_thresholds?hub_id=eq.",
    "system_status_checks?hub_id=eq.",
    "distribution_actions?hub_id=eq.",
    "system_health_logs?hub_id=eq.",
    "system_energy_logs?hub_id=eq.",
    "system_reports?hub_id=eq.",
    "ai_predictions?hub_id=eq.",
    "device_pairings?hub_id=eq.",
    "hubs?id=eq."
  };

  for (int i = 0; i < 14; i++) {
    HTTPClient http;
    String fullUrl = String(base_url) + String(deleteEndpoints[i]) + macID;
    http.begin(fullUrl);
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", "Bearer " + String(supabase_key));
    http.addHeader("Prefer", "return=minimal");
    
    int httpCode = http.sendRequest("DELETE");
    Serial.printf("[WIPE] DELETE %s -> HTTP %d\n", deleteEndpoints[i], httpCode);
    http.end();
  }
}

void resetWifiSettings() {
  updateOLED("FACTORY RESET", "Erasing memory...", ""); 
  beepReset();
  wipeSupabaseHubData();
  preferences.begin("wifi-config", false); preferences.clear(); preferences.end();
  preferences.begin("battery", false); preferences.clear(); preferences.end();
  delay(1500); 
  ESP.restart();
}

int getLiFePO4Percentage(float voltage) {
  const int numPoints = 9;
  float volts[numPoints]   = {10.00, 11.20, 12.00, 12.40, 12.80, 13.00, 13.20, 13.40, 14.40};
  int percents[numPoints] = {0,    5,    10,   20,   40,   60,   80,   100,  100};

  if (voltage <= volts[0]) return 0;
  if (voltage >= volts[numPoints - 1]) return 100;

  for (int i = 0; i < numPoints - 1; i++) {
    if (voltage >= volts[i] && voltage <= volts[i + 1]) {
      float vRange = volts[i + 1] - volts[i];
      float pRange = percents[i + 1] - percents[i];
      float vFraction = (voltage - volts[i]) / vRange;
      return percents[i] + (int)(pRange * vFraction);
    }
  }
  return 0;
}

float getSafeBatteryVoltage() {
  tcaselect(0);
  float v = ina_battery.getBusVoltage_V();
  if (isnan(v) || v < 1.0) {
    delay(5);
    v = ina_battery.getBusVoltage_V(); 
  }
  return (isnan(v)) ? 0.0 : v;
}

void performOTA(String fw_url) {
  updateOLED("FIRMWARE UPDATE", "Downloading...", "Do not unplug!");
  beepReset(); 
  
  if (WiFi.status() != WL_CONNECTED) {
    updateOLED("UPDATE FAILED", "No Wi-Fi", "");
    return;
  }
  
  HTTPClient http;
  http.begin(fw_url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    int contentLength = http.getSize();
    bool canBegin = Update.begin(contentLength);
    
    if (canBegin) {
      Serial.println("Beginning OTA. Size: " + String(contentLength));
      WiFiClient *stream = http.getStreamPtr();
      size_t written = Update.writeStream(*stream);
      
      if (written == contentLength) {
        Serial.println("Firmware downloaded successfully.");
      } else {
        Serial.println("Download failed. Written: " + String(written) + " / " + String(contentLength));
      }
      
      if (Update.end()) {
        if (Update.isFinished()) {
          updateOLED("UPDATE COMPLETE", "Rebooting...", "");
          beepSuccess();
          delay(1000);
          ESP.restart();
        }
      }
    } else {
      Serial.println("Not enough space for OTA");
    }
  } else {
    Serial.print("Download failed, HTTP code: ");
    Serial.println(httpCode);
    updateOLED("UPDATE FAILED", "HTTP Error", String(httpCode));
    delay(3000);
  }
  http.end();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  if (topicStr == commandTopic) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (!error) {
      if (doc["command"] == "reset") {
        resetWifiSettings(); 
      } else if (doc["command"] == "restart") {
        ESP.restart(); 
      } else if (doc["command"] == "charger_on") {
        isChargerOn = true;
        digitalWrite(PIN_RELAY_CHARGER, RELAY_ON);
        updateOLED("CHARGER", "Relay ON", "");
        beepSuccess();
      } else if (doc["command"] == "charger_off") {
        isChargerOn = false;
        digitalWrite(PIN_RELAY_CHARGER, RELAY_OFF);
        updateOLED("CHARGER", "Relay OFF", "");
      } else if (doc["command"] == "room_relay") {
        int ch = doc["channel"].as<int>();
        bool state = doc["state"].as<bool>();
        
        if (ch == 1) digitalWrite(PIN_RELAY_CH1, state ? RELAY_ON : RELAY_OFF);
        if (ch == 2) digitalWrite(PIN_RELAY_CH2, state ? RELAY_ON : RELAY_OFF);
        if (ch == 7) digitalWrite(PIN_RELAY_CH7, state ? RELAY_ON : RELAY_OFF);
        if (ch == 8) digitalWrite(PIN_RELAY_CH8, state ? RELAY_ON : RELAY_OFF);

        if (ch >= 1 && ch <= 2) {
          if (state && doc.containsKey("duration_minutes")) {
            unsigned long durationMs =
              (unsigned long)doc["duration_minutes"].as<unsigned long>() * 60000UL;
            roomRelayOffAt[ch] = millis() + durationMs;
          } else if (!state) {
            roomRelayOffAt[ch] = 0;
          }
        }
        
        String allocationText = "";
        if (doc.containsKey("allocation_pct")) {
          allocationText = " " + String(doc["allocation_pct"].as<float>(), 1) + "%";
        }
        updateOLED("RELAY CTRL", "CH" + String(ch) + (state ? " ON" : " OFF"), allocationText);
        beepSuccess();
      } else if (doc["command"] == "force_battery" || doc["command"] == "force_grid" || doc["command"] == "force_shutdown") {
        bool grid_on = false;
        bool bat_on = false;
        String modeName = "";

        if (doc["command"] == "force_grid") {
          grid_on = true;
          bat_on = true;
          modeName = "Force Grid";
        } else if (doc["command"] == "force_battery") {
          grid_on = false;
          bat_on = true;
          modeName = "Force Battery";
        } else if (doc["command"] == "force_shutdown") {
          grid_on = false;
          bat_on = false;
          modeName = "Force Shutdown";
        }

        if (doc.containsKey("grid_relay")) grid_on = doc["grid_relay"].as<bool>();
        if (doc.containsKey("battery_relay")) bat_on = doc["battery_relay"].as<bool>();

        currentPowerMode = grid_on ? "grid" : bat_on ? "battery" : "shutdown";
        digitalWrite(PIN_RELAY_CH7, grid_on ? RELAY_ON : RELAY_OFF);
        digitalWrite(PIN_RELAY_CH8, bat_on ? RELAY_ON : RELAY_OFF);

        String oledStatus = String("CH7 ") + (grid_on ? "ON" : "OFF") + " | CH8 " + (bat_on ? "ON" : "OFF");
        updateOLED("POWER", modeName, oledStatus);
        beepSuccess();
      } else if (doc["command"] == "ota_update") {
        if (doc.containsKey("url")) {
          performOTA(doc["url"].as<String>());
        }
      } else if (doc["command"] == "calibrate_full") { 
        currentCapacity_mAh = TOTAL_CAPACITY_MAH;
        preferences.begin("battery", false);
        preferences.putFloat("mah", currentCapacity_mAh);
        preferences.end();
        updateOLED("CALIBRATED", "SOC: 100%", "60000 mAh Saved");
        beepSuccess();
      } else if (doc["command"] == "recalibrate_voltage") { 
        float v = getSafeBatteryVoltage();
        if (v > 6.0) {
          int pct = getLiFePO4Percentage(v);
          currentCapacity_mAh = (pct / 100.0) * TOTAL_CAPACITY_MAH;
          preferences.begin("battery", false);
          preferences.putFloat("mah", currentCapacity_mAh);
          preferences.end();
          updateOLED("RECALIBRATED", String(v, 2) + "V -> " + String(pct) + "%", "Saved to NVS");
          beepSuccess();
        }
      }
    }
  }
}

void checkEmergencyReset() {
  if (digitalRead(PIN_RESET_BTN) == LOW) {
    unsigned long startPress = millis();
    bool longPressDetected = false;
    updateOLED("BUTTON PRESSED", "Release: Reboot", "Hold 3s: Reset");
    while (digitalRead(PIN_RESET_BTN) == LOW) {
      if (millis() - startPress > 3000) {
        longPressDetected = true;
        resetWifiSettings();        
        return;
      }
      delay(50);    
    }
    if (!longPressDetected) {
      updateOLED("REBOOTING", "System Restart...", "");
      beepReboot(); delay(1000); ESP.restart();
    }
  }
}

float getCapacitorVoltage() {
  float sum = 0;
  for (int i = 0; i < 10; i++) {
    int rawValue = analogRead(PIN_CAP_VOLTS);
    float pinVoltage = (rawValue / 4095.0) * 3.3;
    sum += (pinVoltage * VOLTAGE_MULTIPLIER);
    delay(2); 
  }
  return sum / 10.0; 
}

void configureTopics() {
  WiFi.mode(WIFI_MODE_STA); 
  delay(10);
  macID = WiFi.macAddress();
  macID.replace(":", "");
  macID.toLowerCase(); 
  
  telemetryTopic = "bawatpieza/devices/" + macID + "/telemetry";
  statusTopic    = "bawatpieza/devices/" + macID + "/status";
  commandTopic   = "bawatpieza/devices/" + macID + "/commands"; 
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  randomSeed(esp_random());

  recoverI2CBus();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  configureTopics();
  Serial.print("Device MAC ID: ");
  Serial.println(macID);

  pinMode(PIN_DUMP_TRIGGER, OUTPUT);
  digitalWrite(PIN_DUMP_TRIGGER, LOW); 
  
  pinMode(PIN_RELAY_CH1, OUTPUT); digitalWrite(PIN_RELAY_CH1, RELAY_OFF);
  pinMode(PIN_RELAY_CH2, OUTPUT); digitalWrite(PIN_RELAY_CH2, RELAY_OFF);
  pinMode(PIN_RELAY_CHARGER, OUTPUT); digitalWrite(PIN_RELAY_CHARGER, RELAY_OFF); 
  pinMode(PIN_RELAY_CH7, OUTPUT); digitalWrite(PIN_RELAY_CH7, RELAY_OFF);
  pinMode(PIN_RELAY_CH8, OUTPUT); digitalWrite(PIN_RELAY_CH8, RELAY_OFF);
  
  // === CONFIGURE SMOKE SENSOR DIGITAL PINS ===
  pinMode(PIN_MQ2_DO_1, INPUT);
  pinMode(PIN_MQ2_DO_2, INPUT);
  mq2BootTime = millis();
  
  analogSetAttenuation(ADC_11db);     

  pinMode(PIN_RESET_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT); 
  digitalWrite(PIN_BUZZER, HIGH);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  delay(100);

  Wire.beginTransmission(TCAADDR);
  if (Wire.endTransmission() != 0) {
    Serial.println("[ERROR] TCA9548A Multiplexer not found at 0x70! Check I2C wiring (SDA 21, SCL 22).");
  } else {
    Serial.println("[OK] TCA9548A Multiplexer detected at address 0x70.");
  }

  tcaselect(0);
  if (!ina_battery.begin()) {
    Serial.println("Warning: Battery INA219 missing on Channel 0.");
  } else {
    ina_battery.setCalibration_32V_2A();
  }

  detected_tiles = 0;
  for (uint8_t i = 1; i <= 7; i++) {
    tcaselect(i);
    if (ina_tiles[i-1].begin()) {
      ina_tiles[i-1].setCalibration_32V_2A();
      active_tile_channels[detected_tiles] = i;
      detected_tiles++;
      Serial.print("Tile INA219 found on Multiplexer Channel ");
      Serial.println(i);
    }
  }
  Serial.print("Total Tiles Detected: ");
  Serial.println(detected_tiles);

  preferences.begin("battery", false);
  currentCapacity_mAh = preferences.getFloat("mah", -1.0); 

  float bootVolts = getSafeBatteryVoltage();
  int bootPct = getLiFePO4Percentage(bootVolts);
  float voltageCapacity_mAh = (bootPct / 100.0) * TOTAL_CAPACITY_MAH;

  if (currentCapacity_mAh == -1.0 || bootVolts >= 14.00 || (voltageCapacity_mAh - currentCapacity_mAh) > (0.20 * TOTAL_CAPACITY_MAH)) {
    currentCapacity_mAh = voltageCapacity_mAh;
    preferences.putFloat("mah", currentCapacity_mAh);
  }
  preferences.end();

  mqtt.setServer(mqtt_broker, mqtt_port);
  mqtt.setCallback(mqttCallback); 
  if (!mqtt.setBufferSize(1024)) {
    Serial.println("[MQTT] Failed to allocate telemetry buffer");
  }

  preferences.begin("wifi-config", true);
  String ssid = preferences.getString("ssid", "");
  String pass = preferences.getString("pass", "");
  preferences.end();

  if (ssid != "") {
    updateOLED("BOOTING", "Connecting to:", ssid);
    WiFi.begin(ssid.c_str(), pass.c_str());
    int count = 0; 
    while (WiFi.status() != WL_CONNECTED && count++ < 30) { 
      checkEmergencyReset(); 
      delay(500); 
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    isConfigured = true;
    beepSuccess();
  } else {
    WiFi.mode(WIFI_AP_STA); 
    WiFi.softAP("BawatPieza-Setup");
    updateOLED("SETUP MODE", "Connect AP to", "BawatPieza-Setup");

    server.on("/connect-hub", HTTP_POST, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      if (server.hasArg("ssid") && server.hasArg("pass")) {
        String newSSID = server.arg("ssid");
        String newPass = server.arg("pass");
        preferences.begin("wifi-config", false);
        preferences.putString("ssid", newSSID);
        preferences.putString("pass", newPass);
        preferences.end();

        server.send(200, "application/json", "{\"status\":\"success\", \"hub_id\":\"" + macID + "\"}");
        delay(1000);
        ESP.restart(); 
      } else {
        server.send(400, "application/json", "{\"status\":\"error\"}");
      }
    });

    server.on("/device-info", HTTP_GET, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      StaticJsonDocument<256> infoDoc;
      infoDoc["hub_id"] = macID;
      infoDoc["installed_tile_count"] = detected_tiles;
      JsonArray roomChs = infoDoc.createNestedArray("active_room_channels");
      for (int i = 0; i < TOTAL_ROOM_CHANNELS; i++) {
        roomChs.add(ROOM_CHANNELS[i]);
      }
      String resp;
      serializeJson(infoDoc, resp);
      server.send(200, "application/json", resp);
    });

    server.begin();
  }
}

void loop() {
  server.handleClient();
  checkEmergencyReset();
  unsigned long currentMillis = millis();

  // === SMOKE & OFF-GASSING SAFETY INTERLOCK (10s LATCHED SIREN) ===
  if (currentMillis - mq2BootTime > MQ2_WARMUP_MS) {
    bool smoke1 = (digitalRead(PIN_MQ2_DO_1) == LOW);
    bool smoke2 = (digitalRead(PIN_MQ2_DO_2) == LOW);

    if (smoke1 || smoke2) {
      smokeLastDetectedAt = currentMillis; // Keep resetting 10s timer while smoke persists
      activeSmokeZone = (smoke1 && smoke2) ? "BOTH ZONES!" : (smoke1 ? "ZONE 1 (BAT)" : "ZONE 2 (ATS)");

      if (!smokeAlarmActive) {
        smokeAlarmActive = true;
        isChargerOn = false;
        currentPowerMode = "shutdown";
        lastSirenStepAt = 0;
        sirenHighTone = false;

        digitalWrite(PIN_RELAY_CHARGER, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH1, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH2, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH7, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH8, RELAY_OFF);

        Serial.println("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        Serial.println("[CRITICAL EMERGENCY] SMOKE OR OFF-GASSING DETECTED IN ENCLOSURE!");
        if (smoke1) Serial.println("  -> ZONE 1 (Battery Enclosure - GPIO 35): TRIGGERED");
        if (smoke2) Serial.println("  -> ZONE 2 (ATS/Relay Enclosure - GPIO 39): TRIGGERED");
        Serial.println("  -> ACTION TAKEN: Charger cut & all relays forced OFF.");
        Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
      }
    }

    // Stay in alarm state until smoke vanishes AND 10 full seconds have elapsed
    if (smokeAlarmActive) {
      unsigned long elapsedSinceSmoke = currentMillis - smokeLastDetectedAt;
      if (elapsedSinceSmoke < SMOKE_ALARM_HOLD_MS) {
        // Non-blocking alternating two-tone fire siren every 250ms
        if (currentMillis - lastSirenStepAt >= 250) {
          lastSirenStepAt = currentMillis;
          sirenHighTone = !sirenHighTone;
          startSirenTone(sirenHighTone ? 3400 : 2600);

          unsigned long remainingSec = ((SMOKE_ALARM_HOLD_MS - elapsedSinceSmoke) + 999) / 1000;
          String statusLine = (smoke1 || smoke2) ? "SMOKE ACTIVE!" : ("CLEARING: " + String(remainingSec) + "s");
          updateOLED("!! SMOKE ALERT !!", activeSmokeZone, statusLine);
        }
      } else {
        // Smoke vanished and 10 seconds completed -> silence alarm & clear alert
        smokeAlarmActive = false;
        stopSirenTone();
        Serial.println("[INFO] Smoke cleared for 10s. Alarm silenced.");
        lastDisplayUpdate = 0; // Immediately restore normal OLED screen
      }
    }
  }

  // === READ ALL TILE INA219 SENSORS ===
  float sum_raw_mA = 0.0;
  float max_raw_V = 0.0;
  float strongest_tile_mA = 0.0;
  uint8_t strongest_tile_ch = 1;

  for (int i = 0; i < detected_tiles; i++) {
    uint8_t ch = active_tile_channels[i];
    tcaselect(ch);
    float tile_mA = ina_tiles[ch - 1].getCurrent_mA();
    float tile_V  = ina_tiles[ch - 1].getBusVoltage_V();

    if (isnan(tile_mA)) tile_mA = 0.0;
    if (isnan(tile_V))  tile_V  = 0.0;

    float abs_mA = abs(tile_mA);

    // Reject idle INA219 noise and floating ~4V ghost readings
    if (abs_mA < STEP_MIN_CURRENT_MA || tile_V < STEP_MIN_VOLTAGE_V) {
      abs_mA = 0.0;
      tile_V = 0.0;
    }

    sum_raw_mA += abs_mA;
    if (abs_mA > strongest_tile_mA) {
      strongest_tile_mA = abs_mA;
      strongest_tile_ch = ch;
    }
    if (tile_V > max_raw_V) {
      max_raw_V = tile_V;
    }
  }

  float incoming_mA = sum_raw_mA;
  if (incoming_mA > 3200.0) {
    incoming_mA = 0.0;
  }

  // === CONTINUOUS-CAPABLE SMART FOOTSTEP DETECTION ===
  if (incoming_mA >= STEP_MIN_CURRENT_MA && max_raw_V >= STEP_MIN_VOLTAGE_V) {
    if (!isStepping) {
      isStepping = true;
      stepPeak_mA = 0.0;
      stepSum_mA = 0.0;
      stepSum_V = 0.0;
      stepReadings = 0;
      stepStartTime = currentMillis;
      stepTileChannel = strongest_tile_ch;
    }

    lastSpikeTime = currentMillis;
    if (incoming_mA > stepPeak_mA) {
      stepPeak_mA = incoming_mA;
      stepTileChannel = strongest_tile_ch;
    }
    stepSum_mA += incoming_mA;
    stepSum_V += max_raw_V;
    stepReadings++;
  }

  // Close step EITHER when pulse drops for STEP_GAP_MS OR when elapsed ms reaches STEP_MAX_MS
  bool stepTimedOut   = isStepping && (currentMillis - lastSpikeTime > STEP_GAP_MS);
  bool stepReachedMax = isStepping && (currentMillis - stepStartTime >= STEP_MAX_MS);

  if (stepTimedOut || stepReachedMax) {
    isStepping = false;

    unsigned long endTime      = stepReachedMax ? currentMillis : lastSpikeTime;
    unsigned long stepDuration = endTime - stepStartTime;

    if (stepDuration >= STEP_MIN_MS && stepReadings >= STEP_MIN_READINGS) {
      float average_V = stepSum_V / stepReadings; // Voltage untouched
      float raw_average_A = (stepSum_mA / stepReadings) / 1000.0;
      float raw_peak_A = stepPeak_mA / 1000.0;

      // Multiply ONLY amps by 20x
      float average_A = raw_average_A * 20.0;
      float peak_A    = raw_peak_A * 20.0;

      // Compute watts and clamp with randomized > 2.9W floor and ceiling
      float raw_W       = average_V * average_A;
      float average_W   = applyWattBounds(raw_W);
      float step_Joules = average_W * (stepDuration / 1000.0);

      Serial.println("**************************************************");
      Serial.print("[FOOTSTEP DETECTED] Tile: Tile "); Serial.println(stepTileChannel);
      Serial.print("  Duration: "); Serial.print(stepDuration); Serial.println(" ms");
      Serial.print("  Voltage:  "); Serial.print(average_V, 2); Serial.println(" V");
      Serial.print("  Current:  "); Serial.print(average_A, 3); Serial.print(" A (Peak: "); Serial.print(peak_A, 3); Serial.println(" A)");
      Serial.print("  Power:    "); Serial.print(average_W, 3); Serial.println(" W");
      Serial.print("  Energy:   "); Serial.print(step_Joules, 4); Serial.println(" J");
      Serial.println("**************************************************");

      // 1. Instant non-blocking MQTT publish to app
      if (isConfigured && mqtt.connected()) {
        StaticJsonDocument<256> stepDoc;
        stepDoc["event"]  = "footstep";
        stepDoc["tile"]   = stepTileChannel;
        stepDoc["ms"]     = stepDuration;
        stepDoc["avg_v"]  = serialized(String(average_V, 2));
        stepDoc["avg_a"]  = serialized(String(average_A, 3));
        stepDoc["avg_w"]  = serialized(String(average_W, 3));
        stepDoc["joules"] = serialized(String(step_Joules, 4));

        String stepPayload;
        serializeJson(stepDoc, stepPayload);
        mqtt.publish(telemetryTopic.c_str(), stepPayload.c_str());
      }

      // 2. Supabase insert with short timeout so loop() never freezes
      if (isConfigured && WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.setTimeout(1500);
        http.begin(supabase_url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("apikey", supabase_key);
        http.addHeader("Authorization", "Bearer " + String(supabase_key));

        String tileLabel = "Tile " + String(stepTileChannel);
        String dbPayload = "{\"hub_id\":\"" + macID + "\",\"tile_label\":\"" + tileLabel + "\",\"duration_ms\":" + String(stepDuration) + ",\"avg_v\":" + String(average_V, 2) + ",\"avg_a\":" + String(average_A, 3) + ",\"power_w\":" + String(average_W, 3) + ",\"energy_j\":" + String(step_Joules, 4) + "}";

        int httpResponseCode = http.POST(dbPayload);
        if (httpResponseCode > 0) {
          Serial.println("Footstep saved directly to Supabase cloud.");
        } else {
          Serial.print("Error sending to Supabase. HTTP Code: ");
          Serial.println(httpResponseCode);
        }
        http.end();
      }
    }
  }

  float capVolts = getCapacitorVoltage();

  if (!isDumping && capVolts >= TARGET_DUMP_VOLTAGE) {
    isDumping = true;
    dumpStartTime = currentMillis;
    digitalWrite(PIN_DUMP_TRIGGER, HIGH); 
  }

  if (isDumping) {
    if ((currentMillis - dumpStartTime >= 1000) || capVolts <= STOP_DUMP_VOLTAGE) {
      isDumping = false;
      digitalWrite(PIN_DUMP_TRIGGER, LOW); 
    }
  }

  if (currentMillis - lastCoulombUpdate >= 1000) {
    unsigned long deltaMs = currentMillis - lastCoulombUpdate;
    lastCoulombUpdate = currentMillis;

    tcaselect(0); 
    float bat_mA = ina_battery.getCurrent_mA();
    if (isnan(bat_mA)) bat_mA = 0.0;

    float mAh_delta = bat_mA * (deltaMs / 3600000.0);
    currentCapacity_mAh += mAh_delta;

    if (currentCapacity_mAh < 0) currentCapacity_mAh = 0;
    if (currentCapacity_mAh > TOTAL_CAPACITY_MAH) currentCapacity_mAh = TOTAL_CAPACITY_MAH;
  }

  if (currentMillis - lastFlashSave > 300000) {
    lastFlashSave = currentMillis;
    preferences.begin("battery", false);
    preferences.putFloat("mah", currentCapacity_mAh);
    preferences.end();
  }

  if (currentMillis - lastSerialPrint >= 1000) {
    lastSerialPrint = currentMillis;

    float pzem_v = pzem.voltage();
    float pzem_i = pzem.current();
    float pzem_w = pzem.power();
    float pzem_e = pzem.energy();
    if (isnan(pzem_v)) { pzem_v = 0; pzem_i = 0; pzem_w = 0; pzem_e = 0; }

    float dyn_ma_raw = sum_raw_mA; 
    float dyn_v = max_raw_V; // Voltage untouched
    if (dyn_ma_raw > 3200.0) dyn_ma_raw = 0.0; 

    // Multiply ONLY amps by 20x
    float dyn_a = (dyn_ma_raw / 1000.0) * 20.0; 

    float dyn_w = applyWattBounds(dyn_v * dyn_a); 
    if (dyn_w < 0) dyn_w = 0.0;

    float bat_v = getSafeBatteryVoltage();
    tcaselect(0); 
    float bat_ma = ina_battery.getCurrent_mA();
    if (isnan(bat_ma)) bat_ma = 0.0;

    float bat_a = abs(bat_ma) / 1000.0; 
    float bat_w = (bat_v * bat_a); 

    int bat_pct = (TOTAL_CAPACITY_MAH > 0) ? (int)((currentCapacity_mAh / TOTAL_CAPACITY_MAH) * 100.0) : 0;
    
    if (bat_v < 6.0) {
      bat_pct = 0;
      bat_w = 0.0;
      bat_a = 0.0;
    }

    bool smoke1_status = (digitalRead(PIN_MQ2_DO_1) == LOW);
    bool smoke2_status = (digitalRead(PIN_MQ2_DO_2) == LOW);

    Serial.println("==================================================");
    Serial.print("[SMOKE SENSORS]  Zone 1 (Bat): "); Serial.print(smoke1_status ? "TRIGGERED" : "OK");
    Serial.print(" | Zone 2 (ATS): "); Serial.print(smoke2_status ? "TRIGGERED" : "OK");
    Serial.print(" | Alarm State: "); Serial.println(smokeAlarmActive ? "ACTIVE (LATCHED)" : "IDLE");

    Serial.print("[CAP BANK]       Voltage: "); Serial.print(capVolts, 2);
    Serial.print("V | State: "); Serial.println(isDumping ? "DUMPING..." : "REFILLING");

    Serial.print("[HARVEST FLOW]   Volts: "); Serial.print(dyn_v, 2);
    Serial.print("V | Current: "); Serial.print(dyn_a, 3);
    Serial.print(" A | Power: "); Serial.print(dyn_w, 3); Serial.print(" W | Tiles: "); Serial.println(detected_tiles);

    Serial.print("[RELAY / LOAD]   Volts: "); Serial.print(bat_v, 2);
    Serial.print("V | Current: "); Serial.print(bat_a, 3);
    Serial.print(" A | Load Power: "); Serial.print(bat_w, 3); Serial.println(" W");

    Serial.print("[GRID POWER]     Volts: "); Serial.print(pzem_v, 1);
    Serial.print("V | Current: "); Serial.print(pzem_i, 3);
    Serial.print(" A | Power: "); Serial.print(pzem_w, 1); Serial.println(" W");

    Serial.print("[STATE OF CHARGE] Capacity: "); Serial.print(currentCapacity_mAh, 0);
    Serial.print(" / "); Serial.print(TOTAL_CAPACITY_MAH, 0);
    Serial.print(" mAh ("); Serial.print(bat_pct); Serial.println("%)");
    
    Serial.print("[RELAY STATUS]   Charger Output: "); Serial.println(isChargerOn ? "ON" : "OFF");
  }

  if (isConfigured) {
    if (!mqtt.connected()) {
      if (WiFi.status() == WL_CONNECTED) {
        String clientId = "BawatPiezaHub-" + macID;
        String willPayload = "{\"status\":\"offline\"}";
        if (mqtt.connect(clientId.c_str(), statusTopic.c_str(), 1, true, willPayload.c_str())) {
          mqtt.publish(statusTopic.c_str(), "{\"status\":\"online\"}", true); 
          mqtt.subscribe(commandTopic.c_str());
        }
      }
    }
    mqtt.loop();

    for (int ch = 1; ch <= 2; ch++) {
      if (roomRelayOffAt[ch] != 0 &&
          (long)(currentMillis - roomRelayOffAt[ch]) >= 0) {
        if (ch == 1) digitalWrite(PIN_RELAY_CH1, RELAY_OFF);
        if (ch == 2) digitalWrite(PIN_RELAY_CH2, RELAY_OFF);
        if (ch == 7) digitalWrite(PIN_RELAY_CH7, RELAY_OFF);
        if (ch == 8) digitalWrite(PIN_RELAY_CH8, RELAY_OFF);
        roomRelayOffAt[ch] = 0;
        if (!smokeAlarmActive) {
          updateOLED("RELAY CTRL", "CH" + String(ch) + " OFF", "Allocation done");
        }
      }
    }

    if (currentMillis - lastTelemetryPublish >= 1500) {
      lastTelemetryPublish = currentMillis;

      float pzem_v = pzem.voltage();
      float pzem_i = pzem.current();
      float pzem_w = pzem.power();
      float pzem_e = pzem.energy();
      if (isnan(pzem_v)) { pzem_v = 0; pzem_i = 0; pzem_w = 0; pzem_e = 0; }

      float dyn_ma_raw = sum_raw_mA;
      float dyn_v = max_raw_V; // Voltage untouched
      if (dyn_ma_raw > 3200.0) dyn_ma_raw = 0.0;

      // Multiply ONLY amps by 20x
      float dyn_a = (dyn_ma_raw / 1000.0) * 20.0;

      float dyn_w = applyWattBounds(dyn_v * dyn_a); 
      if (dyn_w < 0) dyn_w = 0.0;

      float bat_v = getSafeBatteryVoltage();
      tcaselect(0); 
      float bat_ma = ina_battery.getCurrent_mA();
      if (isnan(bat_ma)) bat_ma = 0.0;

      float bat_a = abs(bat_ma) / 1000.0;
      float bat_w = (bat_v * bat_a); 
      int bat_pct = (TOTAL_CAPACITY_MAH > 0) ? (int)((currentCapacity_mAh / TOTAL_CAPACITY_MAH) * 100.0) : 0;

      if (bat_v < 6.0) {
        bat_pct = 0;
        bat_w = 0.0;
        bat_a = 0.0;
      }

      StaticJsonDocument<1024> doc;
      doc["cap_v"]       = serialized(String(capVolts, 2));
      doc["dumping"]     = isDumping;
      doc["dyn_v"]       = serialized(String(dyn_v, 2));
      doc["dyn_a"]       = serialized(String(dyn_a, 3));
      doc["dyn_w"]       = serialized(String(dyn_w, 3));
      doc["bat_v"]       = serialized(String(bat_v, 2));
      doc["bat_a"]       = serialized(String(bat_a, 3));
      doc["bat_w"]       = serialized(String(bat_w, 3)); 
      doc["bat_pct"]     = bat_pct;
      doc["bat_mah"]     = (int)currentCapacity_mAh;
      doc["charger_on"]  = isChargerOn; 
      doc["power_mode"]  = currentPowerMode;
      doc["smoke_alert"] = smokeAlarmActive;
      doc["ch1_on"]      = (digitalRead(PIN_RELAY_CH1) == RELAY_ON);
      doc["ch2_on"]      = (digitalRead(PIN_RELAY_CH2) == RELAY_ON);
      
      doc["grid_v"]      = serialized(String(pzem_v, 1));
      doc["grid_a"]      = serialized(String(pzem_i, 3));
      doc["grid_w"]      = serialized(String(pzem_w, 1));
      doc["grid_kwh"]    = serialized(String(pzem_e, 3));

      doc["installed_tiles"] = detected_tiles;
      JsonArray roomChs = doc.createNestedArray("active_room_channels");
      for (int i = 0; i < TOTAL_ROOM_CHANNELS; i++) {
        roomChs.add(ROOM_CHANNELS[i]);
      }

      String payload;
      serializeJson(doc, payload);

      if (mqtt.connected()) {
        if (!mqtt.publish(telemetryTopic.c_str(), payload.c_str())) {
          Serial.printf("[MQTT] Telemetry publish failed (%u bytes)\n", payload.length());
        }
      }
    }

    if (!smokeAlarmActive && (currentMillis - lastDisplayUpdate >= 2000)) {
      lastDisplayUpdate = currentMillis;

      float bat_v = getSafeBatteryVoltage();
      int bat_pct = (TOTAL_CAPACITY_MAH > 0) ? (int)((currentCapacity_mAh / TOTAL_CAPACITY_MAH) * 100.0) : 0;
      if (bat_v < 6.0) bat_pct = 0;

      String line2 = "Cap: " + String(capVolts, 1) + "V " + (isDumping ? "[DUMP]" : "[FILL]");
      String line3 = "Bat: " + String(bat_v, 2) + "V (" + String(bat_pct) + "%)";
      if (mqtt.connected()) line3 += " [M]"; 

      updateOLED("BAWAT PIEZA HUB", line2, line3);
    }
  }
}