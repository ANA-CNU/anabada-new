import sys
from enum import Enum
import datetime, pytz

class LogLevel(Enum):
    MESSAGE = 1
    ERROR = 2
    WARNING = 3
    DEBUG = 4

class Color:
    RESET = "\033[0m"
    MESSAGE = "\033[94m"  # Blue
    ERROR = "\033[91m"    # Red
    WARNING = "\033[93m"  # Yellow
    DEBUG = "\033[92m"    # Green

class ConsoleAndFileWriter:
    def __init__(self, file_name: str) -> None:
        self.__file = open(file_name, "w")

    def write(self, s: str) -> None:
        sys.stdout.write(s)
        self.__file.write(s)

    def flush(self) -> None:
        sys.stdout.flush()
        self.__file.flush()

__timezone = pytz.timezone('Asia/Seoul')
__cur_level = LogLevel.MESSAGE
__writer = sys.stdout
__color = True

def set_level(level: LogLevel) -> None:
    global __cur_level
    __cur_level = level

def set_writer(writer) -> None:
    global __writer, __color
    __writer = writer
    __color = True if __writer == sys.stdout else False


def __prefix(level: LogLevel) -> str:
    cur_time = datetime.datetime.now(__timezone).replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
    if not __color:
        return f"[{level.name} {cur_time}]".ljust(30)
    if level == LogLevel.MESSAGE:
        return f"{Color.MESSAGE}[MESSAGE {cur_time}]{Color.RESET}".ljust(40)
    elif level == LogLevel.DEBUG:
        return f"{Color.DEBUG}[DEBUG {cur_time}]{Color.RESET}".ljust(40)
    elif level == LogLevel.WARNING:
        return f"{Color.WARNING}[WARNING {cur_time}]{Color.RESET}".ljust(40)
    elif level == LogLevel.ERROR:
        return f"{Color.ERROR}[ERROR {cur_time}]{Color.RESET}\t".ljust(40)
    else:
        return f"[UNKNOWN {cur_time}]".ljust(40)

def __put(level: LogLevel, s: str) -> None:
    if __cur_level.value >= level.value:
        __writer.write(__prefix(level) + s + "\n")
        __writer.flush()

def msg(s: str) -> None: __put(LogLevel.MESSAGE, s)

def debug(s: str) -> None: __put(LogLevel.DEBUG, s)

def warning(s: str) -> None: __put(LogLevel.WARNING, s)

def error(s: str) -> None: __put(LogLevel.ERROR, s)

if __name__ == "__main__":
    set_level(LogLevel.DEBUG)
    msg("This is message")
    debug("This is debug")
    warning("This is warning")
    error("This is error")