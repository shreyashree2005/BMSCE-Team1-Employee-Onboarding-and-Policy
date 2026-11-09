"""Working days: weekly days off plus the configurable company holiday list.

Used to keep onboarding due dates on working days and to explain, in the calendar, why a date has no tasks.
Nothing is guessed: a date is a holiday only if it is a configured weekly day off or listed in the holiday file.
"""

import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


class DayType(str, Enum):
    WORKING = "working"
    WEEKLY_OFF = "weekly_off"
    COMPANY_HOLIDAY = "company_holiday"
    FESTIVAL_HOLIDAY = "festival_holiday"


@dataclass(frozen=True)
class Holiday:
    date: date
    name: str
    type: DayType


class WorkCalendar:
    def __init__(self, weekly_off_days: list[str] | tuple[str, ...] = ("saturday", "sunday"), holidays: list[Holiday] | None = None) -> None:
        unknown = [d for d in weekly_off_days if d.lower() not in WEEKDAYS]
        if unknown:
            raise ValueError(f"Unknown weekday(s): {unknown}")
        self._weekly_off = frozenset(WEEKDAYS.index(d.lower()) for d in weekly_off_days)
        if len(self._weekly_off) == 7:
            raise ValueError("At least one weekday must be a working day")
        self._holidays = {h.date: h for h in holidays or []}

    @property
    def weekly_off_names(self) -> list[str]:
        return [WEEKDAYS[i].capitalize() for i in sorted(self._weekly_off)]

    def holiday(self, day: date) -> Holiday | None:
        return self._holidays.get(day)

    def day_type(self, day: date) -> DayType:
        holiday = self._holidays.get(day)
        if holiday is not None:
            return holiday.type
        if day.weekday() in self._weekly_off:
            return DayType.WEEKLY_OFF
        return DayType.WORKING

    def is_working_day(self, day: date) -> bool:
        return self.day_type(day) == DayType.WORKING

    def on_or_after(self, day: date) -> date:
        """The first working day on or after ``day``."""
        for _ in range(400):
            if self.is_working_day(day):
                return day
            day += timedelta(days=1)
        raise RuntimeError("No working day found within 400 days; check the holiday calendar")

    def next_working_day(self, day: date) -> date:
        """The first working day strictly after ``day``."""
        return self.on_or_after(day + timedelta(days=1))


def load_holidays(path: Path) -> list[Holiday]:
    """Reads the holiday file. A missing or invalid file means "no company holidays" (logged), never a crash."""
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Company holiday file %s not found; only weekly days off apply.", path)
        return []
    except (OSError, ValueError) as error:
        logger.error("Couldn't read company holiday file %s: %s", path, error)
        return []
    holidays = []
    for entry in raw.get("holidays", []) if isinstance(raw, dict) else []:
        try:
            kind = DayType.FESTIVAL_HOLIDAY if entry.get("type") == "festival" else DayType.COMPANY_HOLIDAY
            holidays.append(Holiday(date.fromisoformat(entry["date"]), str(entry["name"]).strip(), kind))
        except (KeyError, TypeError, ValueError) as error:
            logger.error("Skipping invalid holiday entry %r: %s", entry, error)
    return holidays


def calendar_from_settings(settings) -> WorkCalendar:  # noqa: ANN001 - avoids importing Settings (import cycle)
    return WorkCalendar(settings.weekly_off_days, load_holidays(settings.company_holidays_file))
