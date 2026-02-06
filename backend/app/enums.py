"""Enums for type-safe categorical values throughout the application."""
from enum import Enum
from typing import Set


class JournalEntryType(str, Enum):
    """Types of journal entries."""
    OBSERVATION = "Observation"
    FEEDING = "Feeding"
    WATERING = "Watering"
    PRUNING = "Pruning"
    HARVESTING = "Harvesting"
    TREATMENT = "Treatment"
    ENVIRONMENT = "Environment"
    OTHER = "Other"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class EntryPriority(str, Enum):
    """Priority levels for journal entries."""
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class GrowthPhase(str, Enum):
    """Growth phases for plant tracking."""
    SEEDLING = "Seedling"
    VEGETATIVE = "Vegetative"
    PRE_FLOWERING = "Pre-flowering"
    FLOWERING = "Flowering"
    POST_FLOWERING = "Post-flowering"
    HARVESTING = "Harvesting"
    CURING = "Curing"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class SubstrateType(str, Enum):
    """Types of growing substrates."""
    COCO_COIR = "Coco Coir"
    SOIL = "Soil"
    HYDROPONIC = "Hydroponic"
    AQUAPONIC = "Aquaponic"
    AEROPONIC = "Aeroponic"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class NutrientPlan(str, Enum):
    """Standard nutrient plan types."""
    VEGETATIVE = "Vegetative"
    FLOWERING = "Flowering"
    CUSTOM = "Custom"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class MixStatus(str, Enum):
    """Status of nutrient mixes."""
    PENDING = "Pending"
    MIXING = "Mixing"
    MIXED = "Mixed"
    APPLIED = "Applied"
    DISCARDED = "Discarded"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


class TelemetryLevel(str, Enum):
    """Telemetry collection levels."""
    MINIMAL = "Minimal"
    STANDARD = "Standard"
    DETAILED = "Detailed"
    
    @classmethod
    def valid_values(cls) -> Set[str]:
        return {item.value for item in cls}


def validate_enum_value(enum_class: type, value: str) -> bool:
    """Check if a value is valid for the given enum."""
    return value in enum_class.valid_values()
