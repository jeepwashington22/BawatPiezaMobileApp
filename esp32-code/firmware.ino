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

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1

#define PIN_RESET_BTN 0  
#define PIN_BUZZER    14 

// === CAPACITOR BUCKET DUMP PINS & THRESHOLDS ===
#define PIN_CAP_VOLTS    34  // Reads 100k/22k Voltage Divider
#define PIN_DUMP_TRIGGER 26  // Drives 2N5551 Base to trigger MOSFET/Dump

// === RELAY MODULE SETTINGS ===
#define PIN_RELAY_CHARGER 27 
#define PIN_RELAY_CH7     32 // Relay CH7 (Grid Power)
#define PIN_RELAY_CH8     33 // Relay CH8 (Battery Power)

// updated to active-low logic for standard relay modules
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

const float VOLTAGE_MULTIPLIER   = 5.545; // (100k + 22k) / 22k
const float TARGET_DUMP_VOLTAGE  = 6.0;   // Open dump at 6.0V
const float STOP_DUMP_VOLTAGE    = 5.0;   // Close dump below 5.0V

// === TCA9548A MULTIPLEXER ADDRESS ===
#define TCAADDR 0x70

// === 4S 12.8V 60Ah LiFePO4 BATTERY CONFIGURATION ===
const float BATTERY_CAPACITY_AH = 60.0; 
const float TOTAL_CAPACITY_MAH  = BATTERY_CAPACITY_AH * 1000.0;
float currentCapacity_mAh       = 0.0; 

// Hardware Objects
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_INA219 ina_dynamo;  
Adafruit_INA219 ina_battery; 

Preferences preferences;
WebServer server(80);

WiFiClient espClient; 
PubSubClient mqtt(espClient);

// === CLOUD CREDENTIALS ===
const char* mqtt_broker = "broker.hivemq.com"; 
const int mqtt_port     = 1883; 

// SUPABASE CREDENTIALS
const char* supabase_url = "https://qbajmzjrnkxbsexzdixs.supabase.co/rest/v1/kinetic_logs";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYWptempybmt4YnNleHpkaXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDM1ODUsImV4cCI6MjEwMzU3OTU4NX0.90OEN6du1xSn725B7DHijW2KrmeB4ZdyAhzbe6r1ZlU"; 

bool isConfigured          = false;
bool isDumping             = false;
bool isChargerOn           = false; 
unsigned long dumpStartTime = 0;

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

void resetWifiSettings() {
  updateOLED("FACTORY RESET", "Erasing memory...", ""); 
  beepReset();
  preferences.begin("wifi-config", false); preferences.clear(); preferences.end();
  preferences.begin("battery", false); preferences.clear(); preferences.end();
  delay(2000); 
  ESP.restart();
}

// === SCALED FOR 4S (12.8V) LiFePO4 ===
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

// === SAFE I2C VOLTAGE READ (Prevents transient 0V display drops) ===
float getSafeBatteryVoltage() {
  tcaselect(0);
  float v = ina_battery.getBusVoltage_V();
  if (isnan(v) || v < 1.0) {
    delay(5);
    v = ina_battery.getBusVoltage_V(); // Retry once on I2C noise
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
      } else if (doc["command"] == "force_battery") {
        digitalWrite(PIN_RELAY_CH7, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH8, RELAY_ON);
        updateOLED("POWER", "Force Battery", "CH8 ON | CH7 OFF");
        beepSuccess();
      } else if (doc["command"] == "force_grid") {
        digitalWrite(PIN_RELAY_CH7, RELAY_ON);
        digitalWrite(PIN_RELAY_CH8, RELAY_OFF);
        updateOLED("POWER", "Force Grid", "CH7 ON | CH8 OFF");
        beepSuccess();
      } else if (doc["command"] == "force_shutdown") {
        digitalWrite(PIN_RELAY_CH7, RELAY_OFF);
        digitalWrite(PIN_RELAY_CH8, RELAY_OFF);
        updateOLED("POWER", "Force Shutdown", "CH7 & CH8 OFF");
        beepSuccess();
      } else if (doc["command"] == "ota_update") {
        if (doc.containsKey("url")) {
          String url = doc["url"].as<String>();
          performOTA(url);
        }
      } else if (doc["command"] == "calibrate_full") { // NEW: Force SOC to 100%
        currentCapacity_mAh = TOTAL_CAPACITY_MAH;
        preferences.begin("battery", false);
        preferences.putFloat("mah", currentCapacity_mAh);
        preferences.end();
        updateOLED("CALIBRATED", "SOC: 100%", "60000 mAh Saved");
        beepSuccess();
      } else if (doc["command"] == "recalibrate_voltage") { // NEW: Force reset SOC to curve
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
  macID = WiFi.macAddress();
  macID.replace(":", "");
  macID.toLowerCase(); 
  telemetryTopic = "bawatpieza/devices/" + macID + "/telemetry";
  statusTopic    = "bawatpieza/devices/" + macID + "/status";
  commandTopic   = "bawatpieza/devices/" + macID + "/commands"; 
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  pinMode(PIN_DUMP_TRIGGER, OUTPUT);
  digitalWrite(PIN_DUMP_TRIGGER, LOW); 
  
  pinMode(PIN_RELAY_CHARGER, OUTPUT);
  digitalWrite(PIN_RELAY_CHARGER, RELAY_OFF); 

  pinMode(PIN_RELAY_CH7, OUTPUT);
  digitalWrite(PIN_RELAY_CH7, RELAY_OFF);

  pinMode(PIN_RELAY_CH8, OUTPUT);
  digitalWrite(PIN_RELAY_CH8, RELAY_OFF);
  
  analogSetAttenuation(ADC_11db);     

  pinMode(PIN_RESET_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT); 
  digitalWrite(PIN_BUZZER, HIGH);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  delay(100);

  tcaselect(0);
  if (!ina_battery.begin()) {
    Serial.println("Warning: Battery INA219 missing on Channel 0.");
  } else {
    ina_battery.setCalibration_32V_2A();
  }

  tcaselect(2);
  if (!ina_dynamo.begin()) {
    Serial.println("Warning: Harvester INA219 missing on Channel 2.");
  } else {
    ina_dynamo.setCalibration_32V_2A();
  }

  preferences.begin("battery", false);
  currentCapacity_mAh = preferences.getFloat("mah", -1.0); 

  float bootVolts = getSafeBatteryVoltage();
  int bootPct = getLiFePO4Percentage(bootVolts);
  float voltageCapacity_mAh = (bootPct / 100.0) * TOTAL_CAPACITY_MAH;

  // RECALIBRATION RULE:
  // Reset NVS if uninitialized (-1.0), fully charged (>=14.0V), OR if voltage indicates 
  // battery is substantially higher than stored capacity (e.g. off-board charging occurred).
  if (currentCapacity_mAh == -1.0 || bootVolts >= 14.00 || (voltageCapacity_mAh - currentCapacity_mAh) > (0.20 * TOTAL_CAPACITY_MAH)) {
    currentCapacity_mAh = voltageCapacity_mAh;
    preferences.putFloat("mah", currentCapacity_mAh);
  }
  preferences.end();

  mqtt.setServer(mqtt_broker, mqtt_port);
  mqtt.setCallback(mqttCallback); 

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
    configureTopics();
    beepSuccess();
  } else {
    WiFi.mode(WIFI_AP_STA); 
    WiFi.softAP("BawatPieza-Setup");
    updateOLED("SETUP MODE", "Connect AP to", "BawatPieza-Setup");

    server.on("/connect-hub", HTTP_POST, []() {
      if (server.hasArg("ssid") && server.hasArg("pass")) {
        String newSSID = server.arg("ssid");
        String newPass = server.arg("pass");

        preferences.begin("wifi-config", false);
        preferences.putString("ssid", newSSID);
        preferences.putString("pass", newPass);
        preferences.end();

        String mac = WiFi.macAddress();
        mac.replace(":", "");
        mac.toLowerCase();
        String jsonResponse = "{\"status\":\"success\", \"hub_id\":\"" + mac + "\"}";

        server.send(200, "application/json", jsonResponse);

        delay(1000);
        ESP.restart(); 
      } else {
        server.send(400, "application/json", "{\"status\":\"error\"}");
      }
    });

    server.begin();
  }
}

void loop() {
  server.handleClient();
  checkEmergencyReset();
  unsigned long currentMillis = millis();

  tcaselect(2); 

  float raw_mA = ina_dynamo.getCurrent_mA();
  float raw_V  = ina_dynamo.getBusVoltage_V();
  if (isnan(raw_mA)) raw_mA = 0.0;
  if (isnan(raw_V)) raw_V = 0.0;
  float incoming_mA = abs(raw_mA); 

  if (incoming_mA > 3200.0) {
    incoming_mA = 0.0;
  }

  if (incoming_mA > 2.0) {
    if (!isStepping) {
      isStepping = true;
      stepPeak_mA = 0.0;
      stepSum_mA = 0.0;
      stepSum_V = 0.0;
      stepReadings = 0;
      stepStartTime = currentMillis;
    }

    lastSpikeTime = currentMillis; 
    if (incoming_mA > stepPeak_mA) stepPeak_mA = incoming_mA; 
    stepSum_mA += incoming_mA; 
    stepSum_V += raw_V; 
    stepReadings++;
  }

  if (isStepping && (currentMillis - lastSpikeTime > 300)) {
    isStepping = false; 

    unsigned long stepDuration = lastSpikeTime - stepStartTime;

    if (stepDuration >= 50) {
      float average_V = stepSum_V / stepReadings;
      float raw_average_A = (stepSum_mA / stepReadings) / 1000.0;
      float raw_peak_A = stepPeak_mA / 1000.0;

      float average_A = raw_average_A;
      float peak_A = raw_peak_A;

      bool applyScale = (raw_peak_A <= 0.2);

      if (applyScale) {
        average_A = raw_average_A * 20.0;
        peak_A = raw_peak_A * 20.0;
      }

      float average_W = average_V * average_A; 
      float step_Joules = average_W * (stepDuration / 1000.0); 

      // 1. MQTT PUBLISH TO APP
      if (isConfigured && mqtt.connected()) {
        StaticJsonDocument<200> stepDoc;
        stepDoc["event"]  = "footstep";
        stepDoc["ms"]     = stepDuration;
        stepDoc["avg_v"]  = serialized(String(average_V, 2)); 
        stepDoc["avg_a"]  = serialized(String(average_A, 3)); 
        stepDoc["avg_w"]  = serialized(String(average_W, 3));
        stepDoc["joules"] = serialized(String(step_Joules, 4));

        String stepPayload;
        serializeJson(stepDoc, stepPayload);
        mqtt.publish(telemetryTopic.c_str(), stepPayload.c_str());
      }
      
      // 2. HTTP POST DIRECTLY TO SUPABASE
      if (isConfigured && WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(supabase_url);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("apikey", supabase_key);
        http.addHeader("Authorization", "Bearer " + String(supabase_key));
        
        String dbPayload = "{\"hub_id\":\"" + macID + "\",\"tile_label\":\"Tile 1\",\"duration_ms\":" + String(stepDuration) + ",\"avg_v\":" + String(average_V, 2) + ",\"avg_a\":" + String(average_A, 3) + ",\"power_w\":" + String(average_W, 3) + ",\"energy_j\":" + String(step_Joules, 4) + "}";
        
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

  // === 1. CAPACITOR BUCKET DUMP CONTROL ===
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

  // === 2. COULOMB COUNTING ENGINE ===
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

  // === 3. FLASH MEMORY SAVER (Every 5 Minutes) ===
  if (currentMillis - lastFlashSave > 300000) {
    lastFlashSave = currentMillis;
    preferences.begin("battery", false);
    preferences.putFloat("mah", currentCapacity_mAh);
    preferences.end();
  }

  // === 4. SERIAL MONITOR OUTPUT (Every 1 Second) ===
  if (currentMillis - lastSerialPrint >= 1000) {
    lastSerialPrint = currentMillis;

    tcaselect(2); 
    float dyn_v  = ina_dynamo.getBusVoltage_V();
    float dyn_ma_raw = abs(ina_dynamo.getCurrent_mA()); 
    if (isnan(dyn_v))  dyn_v = 0.0;
    if (isnan(dyn_ma_raw)) dyn_ma_raw = 0.0;

    if (dyn_ma_raw > 3200.0) dyn_ma_raw = 0.0; 

    float dyn_a = dyn_ma_raw / 1000.0; 
    if (dyn_a <= 0.1) dyn_a *= 20.0;

    float dyn_w = (dyn_v * dyn_a); 
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

    Serial.println("==================================================");
    Serial.print("[CAP BANK]       Voltage: "); Serial.print(capVolts, 2);
    Serial.print("V | State: "); Serial.println(isDumping ? "DUMPING..." : "REFILLING");

    Serial.print("[HARVEST FLOW]   Volts: "); Serial.print(dyn_v, 2);
    Serial.print("V | Current: "); Serial.print(dyn_a, 3);
    Serial.print(" A | Power: "); Serial.print(dyn_w, 3); Serial.println(" W");

    Serial.print("[RELAY / LOAD]   Volts: "); Serial.print(bat_v, 2);
    Serial.print("V | Current: "); Serial.print(bat_a, 3);
    Serial.print(" A | Load Power: "); Serial.print(bat_w, 3); Serial.println(" W");

    Serial.print("[STATE OF CHARGE] Capacity: "); Serial.print(currentCapacity_mAh, 0);
    Serial.print(" / "); Serial.print(TOTAL_CAPACITY_MAH, 0);
    Serial.print(" mAh ("); Serial.print(bat_pct); Serial.println("%)");
    
    Serial.print("[RELAY STATUS]   Charger Output: "); Serial.println(isChargerOn ? "ON" : "OFF");
  }

  // === 5. MQTT & TELEMETRY ENGINE ===
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

    if (currentMillis - lastTelemetryPublish >= 1500) {
      lastTelemetryPublish = currentMillis;

      tcaselect(2); 
      float dyn_v  = ina_dynamo.getBusVoltage_V();
      float dyn_ma_raw = abs(ina_dynamo.getCurrent_mA());
      if (isnan(dyn_v))  dyn_v = 0.0;
      if (isnan(dyn_ma_raw)) dyn_ma_raw = 0.0;

      if (dyn_ma_raw > 3200.0) dyn_ma_raw = 0.0;

      float dyn_a = dyn_ma_raw / 1000.0;
      if (dyn_a <= 0.1) dyn_a *= 20.0;

      float dyn_w = (dyn_v * dyn_a); 
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

      StaticJsonDocument<256> doc;
      doc["cap_v"]      = serialized(String(capVolts, 2));
      doc["dumping"]    = isDumping;
      doc["dyn_v"]      = serialized(String(dyn_v, 2));
      doc["dyn_a"]      = serialized(String(dyn_a, 3));
      doc["dyn_w"]      = serialized(String(dyn_w, 3));
      doc["bat_v"]      = serialized(String(bat_v, 2));
      doc["bat_a"]      = serialized(String(bat_a, 3));
      doc["bat_w"]      = serialized(String(bat_w, 3)); 
      doc["bat_pct"]    = bat_pct;
      doc["bat_mah"]    = (int)currentCapacity_mAh;
      doc["charger_on"] = isChargerOn; 

      String payload;
      serializeJson(doc, payload);

      if (mqtt.connected()) {
        mqtt.publish(telemetryTopic.c_str(), payload.c_str());
      }
    }

    if (currentMillis - lastDisplayUpdate >= 2000) {
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