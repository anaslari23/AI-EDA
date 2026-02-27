"""Hardware Intent Parser — Engine 1

Extracts structured hardware requirements from natural language descriptions.
Rule-based keyword extraction with extensibility hooks.
"""

import re
from app.schemas.intent import HardwareIntent, DeviceConstraints

# Keyword dictionaries for NL extraction
SENSOR_KEYWORDS = {
    "temperature": "temperature",
    "temp": "temperature",
    "humidity": "humidity",
    "pressure": "pressure",
    "barometric": "pressure",
    "motion": "IMU/accelerometer",
    "accelerometer": "IMU/accelerometer",
    "gyroscope": "IMU/gyroscope",
    "gps": "GPS",
    "location": "GPS",
    "light": "ambient light",
    "lux": "ambient light",
    "soil moisture": "soil moisture",
    "moisture": "soil moisture",
    "gas": "gas sensor",
    "co2": "CO2 sensor",
    "pm2.5": "particulate sensor",
    "air quality": "air quality sensor",
    "ultrasonic": "ultrasonic distance",
    "distance": "distance sensor",
    "current": "current sensor",
    "voltage": "voltage sensor",
    "pir": "PIR motion sensor",
    "camera": "camera module",
    "microphone": "microphone",
}

ACTUATOR_KEYWORDS = {
    "motor": "DC motor",
    "servo": "servo motor",
    "stepper": "stepper motor",
    "relay": "relay",
    "valve": "solenoid valve",
    "solenoid": "solenoid",
    "pump": "pump",
    "led": "LED",
    "display": "display",
    "oled": "OLED display",
    "lcd": "LCD display",
    "buzzer": "buzzer",
    "speaker": "speaker",
    "fan": "fan",
    "heater": "heater",
    "lock": "electronic lock",
}

CONNECTIVITY_KEYWORDS = {
    "wifi": "WiFi",
    "wi-fi": "WiFi",
    "bluetooth": "Bluetooth",
    "ble": "BLE",
    "lora": "LoRa",
    "lorawan": "LoRaWAN",
    "zigbee": "Zigbee",
    "cellular": "Cellular",
    "4g": "4G LTE",
    "5g": "5G",
    "nb-iot": "NB-IoT",
    "ethernet": "Ethernet",
    "usb": "USB",
    "can": "CAN bus",
    "modbus": "Modbus",
    "mqtt": "MQTT",
}

PROTOCOL_KEYWORDS = {
    "i2c": "I2C",
    "spi": "SPI",
    "uart": "UART",
    "onewire": "1-Wire",
    "1-wire": "1-Wire",
    "analog": "ADC",
    "adc": "ADC",
    "pwm": "PWM",
    "gpio": "GPIO",
    "i2s": "I2S",
    "sdio": "SDIO",
}

POWER_KEYWORDS = {
    "battery": "battery",
    "lipo": "LiPo battery",
    "li-ion": "Li-Ion battery",
    "lithium": "lithium battery",
    "aa": "AA batteries",
    "aaa": "AAA batteries",
    "coin cell": "coin cell (CR2032)",
    "solar": "solar powered",
    "usb powered": "USB powered",
    "mains": "AC mains",
    "5v": "5V DC",
    "12v": "12V DC",
    "24v": "24V DC",
    "power supply": "external power supply",
    "poe": "Power over Ethernet",
}

ENVIRONMENT_KEYWORDS = {
    "outdoor": "outdoor",
    "indoor": "indoor",
    "underwater": "underwater",
    "industrial": "industrial",
    "harsh": "harsh/industrial",
    "wearable": "wearable",
    "automotive": "automotive",
    "medical": "medical",
    "agricultural": "agricultural",
    "greenhouse": "greenhouse",
}


def _extract_matches(text: str, keyword_map: dict[str, str]) -> list[str]:
    """Extract unique matches from text using keyword dictionary."""
    text_lower = text.lower()
    found = []
    for keyword, value in keyword_map.items():
        if keyword in text_lower and value not in found:
            found.append(value)
    return found


def _extract_single(text: str, keyword_map: dict[str, str]) -> str | None:
    """Extract the first match from text."""
    matches = _extract_matches(text, keyword_map)
    return matches[0] if matches else None


def _detect_device_type(text: str) -> str | None:
    """Infer device type from description."""
    text_lower = text.lower()
    device_patterns = [
        (r"weather\s*station", "weather_station"),
        (r"irrigation|water.*control", "irrigation_controller"),
        (r"tracker|tracking", "asset_tracker"),
        (r"monitor|monitoring", "environmental_monitor"),
        (r"robot", "robot"),
        (r"drone", "drone"),
        (r"gateway", "IoT_gateway"),
        (r"smart\s*lock", "smart_lock"),
        (r"thermostat", "smart_thermostat"),
        (r"alarm|security", "security_system"),
        (r"wearable|watch|band", "wearable_device"),
        (r"data\s*logger", "data_logger"),
        (r"controller", "controller"),
        (r"sensor\s*node", "sensor_node"),
    ]
    for pattern, device_type in device_patterns:
        if re.search(pattern, text_lower):
            return device_type
    return "embedded_device"


def _extract_constraints(text: str) -> DeviceConstraints:
    """Extract budget, size, and battery life constraints."""
    budget = None
    size = None
    battery_life = None

    budget_match = re.search(
        r"(?:under|below|less than|budget|cost)\s*\$?(\d+)", text, re.IGNORECASE
    )
    if budget_match:
        budget = f"${budget_match.group(1)}"

    size_match = re.search(
        r"(\d+)\s*(?:cm|mm)\s*[x×]\s*(\d+)\s*(?:cm|mm)", text, re.IGNORECASE
    )
    if size_match:
        size = size_match.group(0)

    battery_match = re.search(
        r"(\d+)\s*(month|year|week|day|hour)s?\s*(?:battery|on battery|battery\s*life)",
        text,
        re.IGNORECASE,
    )
    if not battery_match:
        battery_match = re.search(
            r"(?:last|run|operate)\s*(?:for\s*)?(?:at\s*least\s*)?(\d+)\s*(month|year|week|day|hour)s?",
            text,
            re.IGNORECASE,
        )
    if battery_match:
        battery_life = f"{battery_match.group(1)} {battery_match.group(2)}s"

    return DeviceConstraints(budget=budget, size=size, battery_life=battery_life)


def _detect_data_logging(text: str) -> bool:
    """Detect if data logging is required."""
    keywords = [
        "log",
        "logging",
        "record",
        "store",
        "sd card",
        "flash",
        "eeprom",
        "save data",
    ]
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def parse_intent(description: str) -> tuple[HardwareIntent, float]:
    """Parse natural language into structured hardware intent.

    Returns:
        (HardwareIntent, confidence_score)
    """
    sensors = _extract_matches(description, SENSOR_KEYWORDS)
    actuators = _extract_matches(description, ACTUATOR_KEYWORDS)
    connectivity = _extract_matches(description, CONNECTIVITY_KEYWORDS)
    protocols = _extract_matches(description, PROTOCOL_KEYWORDS)
    power = _extract_single(description, POWER_KEYWORDS)
    environment = _extract_single(description, ENVIRONMENT_KEYWORDS)
    device_type = _detect_device_type(description)
    constraints = _extract_constraints(description)
    data_logging = _detect_data_logging(description)

    # Confidence heuristic: more fields extracted = higher confidence
    fields_found = sum(
        [
            bool(device_type),
            len(sensors) > 0,
            len(actuators) > 0,
            len(connectivity) > 0,
            bool(power),
            bool(environment),
        ]
    )
    confidence = min(1.0, fields_found / 6.0 * 0.9 + 0.1)

    intent = HardwareIntent(
        device_type=device_type,
        connectivity=connectivity,
        power_source=power,
        environment=environment,
        sensors=sensors,
        actuators=actuators,
        constraints=constraints,
        communication_protocol=protocols,
        data_logging=data_logging,
    )

    return intent, round(confidence, 2)
