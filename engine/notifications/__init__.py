"""Reliable, opt-in external incident notifications.

The package is deliberately separate from the investigator: it may notify an operator about a
published report, but it never changes payment traffic or an investigation result.
"""

from engine.notifications.config import NotificationSettings
from engine.notifications.service import NotificationService

__all__ = ["NotificationService", "NotificationSettings"]
