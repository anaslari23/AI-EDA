export interface HardwareIntent {
    device_type: string | null;
    connectivity: string[];
    power_source: string | null;
    environment: string | null;
    sensors: string[];
    actuators: string[];
    constraints: {
        budget: string | null;
        size: string | null;
        battery_life: string | null;
    };
    communication_protocol: string[];
    data_logging: boolean;
}

export interface IntentParseResponse {
    intent: HardwareIntent;
    confidence: number;
    raw_input: string;
}

export interface MCU {
    part_number: string;
    manufacturer: string;
    core: string;
    clock_mhz: number;
    flash_kb: number;
    ram_kb: number;
    gpio_count: number;
    operating_voltage: number;
    interfaces: string[];
    wireless: string[];
    package: string;
    unit_price: number;
}

export interface Sensor {
    part_number: string;
    manufacturer: string;
    sensor_type: string;
    interface: string;
    operating_voltage_min: number;
    operating_voltage_max: number;
    package: string;
    unit_price: number;
}

export interface CircuitNode {
    id: string;
    type: string;
    part_number: string;
    properties: Record<string, unknown>;
    pins: string[];
}

export interface CircuitEdge {
    id: string;
    source_node: string;
    source_pin: string;
    target_node: string;
    target_pin: string;
    net_name: string;
    signal_type: string;
}

export interface CircuitGraph {
    nodes: CircuitNode[];
    edges: CircuitEdge[];
    power_rails: Array<{
        name: string;
        voltage: number;
        source_node: string;
        consumers: string[];
    }>;
    ground_net: string;
    power_source: Record<string, unknown>;
}

export interface ValidationError {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    node_ids: string[];
    suggestion: string | null;
}

export interface ValidationResult {
    status: "VALID" | "INVALID";
    errors: ValidationError[];
    warnings: ValidationError[];
    checks_passed: number;
    checks_total: number;
}

export interface BOMEntry {
    component: string;
    part_number: string;
    quantity: number;
    package: string;
    estimated_cost: string;
    distributor: string;
    reference_designator: string;
}

export interface PCBConstraints {
    trace_width: string;
    copper_thickness: string;
    layer_count: number;
    clearance: string;
    ground_plane: boolean;
    thermal_notes: string[];
}

export interface PipelineResult {
    intent: IntentParseResponse;
    components: {
        mcu: MCU;
        sensors: Sensor[];
        power: Record<string, string | null>;
        regulators: unknown[];
        passives: unknown[];
        protection: unknown[];
    };
    circuit: CircuitGraph;
    validation: ValidationResult;
    corrections_applied: string[];
    pcb_constraints: PCBConstraints | null;
    bom: { bom: BOMEntry[]; total_estimated_cost: string; component_count: number } | null;
    pipeline_status: string;
    iterations: number;
}
