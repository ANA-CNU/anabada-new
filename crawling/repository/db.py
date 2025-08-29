import os, pymysql, datetime
from dotenv import load_dotenv
from pymysql.connections import Connection
from pymysql.cursors import Cursor

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT"))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DATABASE = os.getenv("DB_DATABASE")

conn: Connection
__cursor: Cursor

def open_db():
    global conn, __cursor
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, passwd = DB_PASSWORD, db=DB_DATABASE, port=DB_PORT)
    __cursor = conn.cursor()

def close_db():
    __cursor.close()
    conn.close()

def db_commit():
    conn.commit()

def get_user(username: str = '') -> tuple:
    """
    Args:
        username (str): 비워두면 모두 가져온다.

    Returns:
        tuple: (id, name, corrects, submissions, solution)
    """
    if username == '':
        sql = "SELECT * FROM user"
        rows = __cursor.execute(sql)
    else:
        sql = "SELECT * FROM user WHERE name = %s"
        rows = __cursor.execute(sql, username)
    return __cursor.fetchall()

def update_user(username: str, corrects: int, submissions: int, solution: int, user_tier: int) -> int:
    """
    없으면 추가하고, 있으면 갱신한다.
    Args:
        username (str): 이름
        corrects (int): 맞은 문제
        submissions (int): 제출
        solution (int): 마지막 제출번호

    Returns:
        int: 변경된 행 수
    """
    sql = "SELECT name FROM user WHERE name = %s"
    rows = __cursor.execute(sql, (username))
    if rows == 0:
        sql = "INSERT INTO user (corrects, submissions, solution, tier, name) VALUES (%s, %s, %s, %s, %s)"
    else:
        sql = "UPDATE user SET corrects = %s, submissions = %s, solution = %s, tier = %s WHERE name = %s"
    rows = __cursor.execute(sql, (corrects, submissions, solution, user_tier, username))
    return rows

# time = "2024-08-25 19:52:59"
# time = datetime.datetime.strptime(time, "%Y-%m-%d %H:%M:%S")
def add_problem(name: str, problem: int, problem_tier: int, time: datetime, level: int) -> int:
    """
    문제 해결했음을 기록한다.
    Args:
        username (str): 이름
        problem_id (int): 문제 번호
        problem_tier (int) : 문제티어
        time (datetime): 푼 시간
        level (int): 문제티어 - 유저티어
    Returns:
        int: 변경된 행 수
    """
    repeatation = get_repeat_time(name, problem)
    sql = "INSERT INTO problem (name, problem, problem_tier, time, level, repeatation) VALUES (%s, %s, %s, %s, %s, %s)"
    __cursor.execute(sql, (name, problem, problem_tier, time, level, repeatation))
    return __cursor.lastrowid

def add_score_history(
    user_id: int,
    desc: str,
    bias: int,
    event_id: int,
    problem_id: int,
    created_at: datetime.datetime
) -> None:
    """
    Score history에 점수 획득 사유 기록
    Args:
        user_id (int): 유저 식별 번호
        desc (str): 점수 획득 사유 설명
        bias (int): 획득 점수
        event_id (int): 이벤트 ID
        problem_id (int): 문제 ID
        created_at (datetime, optional): 생성 시각. None일 경우 DB 기본값(CURRENT_TIMESTAMP) 사용
    """

    sql = """
        INSERT INTO score_history
            (user_id, `desc`, bias, event_id, problem_id, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    params = (user_id, desc, bias, event_id, problem_id, created_at)

    __cursor.execute(sql, params)

def get_user_id(name: str) -> int:
    sql = "SELECT id FROM user WHERE name = %s"
    __cursor.execute(sql, name)
    return __cursor.fetchone()[0]

def get_problem_id(problem: int) -> tuple:
    sql = "SELECT id FROM problem WHERE problem = %s"
    __cursor.execute(sql, problem)
    return tuple(i[0] for i in __cursor.fetchall())

def get_problem_id_by_user(name: str, problem: int) -> tuple:
    sql = "SELECT id FROM problem WHERE problem = %s AND name = %s"
    __cursor.execute(sql, (problem, name))
    return tuple(i[0] for i in __cursor.fetchall())

def get_event_title(event_id: int):
    sql = "SELECT title FROM event WHERE id = %s"
    __cursor.execute(sql, event_id)
    return __cursor.fetchone()[0]

def get_ongoing_events(time: datetime.datetime) -> tuple:
    sql = "SELECT id FROM event WHERE begin < %s AND %s < end"
    __cursor.execute(sql, (time, time))
    return tuple(i[0] for i in __cursor.fetchall())

def get_event_problems(time: datetime.datetime) -> tuple:
    ongoing_events = get_ongoing_events(time)
    event_problems = ()

    for event_id in ongoing_events:
        sql = 'SELECT problem FROM event_problem WHERE event_id = %s'
        __cursor.execute(sql, event_id)
        event_problems += tuple(i[0] for i in __cursor.fetchall())

    return event_problems

def get_user_score_history(user_id: int) -> tuple:
    """
    user의 모든 score_history를 가져온다
    """

    sql = "SELECT * FROM score_history WHERE user_id = %s"
    __cursor.execute(sql, user_id)
    return __cursor.fetchall()

def get_user_score_history_by_event(user_id: int, event_id: int) -> tuple:
    sql = 'SELECT * FROM score_history WHERE user_id = %s AND event_id = %s'
    __cursor.execute(sql, (user_id, event_id))
    return __cursor.fetchall()

def get_score_history_by_month(time: datetime.datetime):
    year = time.year
    month = time.month
    next_month = month + 1 if month != 12 else 1
    next_year = year if month != 12 else year + 1
    sql = """SELECT user_id, bias FROM score_history WHERE created_at >= %s AND created_at < %s """
    __cursor.execute(sql, (datetime.datetime(year, month, 1), datetime.datetime(next_year, next_month, 1)))
    return __cursor.fetchall()

def get_problems(username: str) -> tuple:
    """
    특정 유저가 푼 문제들을 모두 가져온다
    Args:
        username (str): 이름

    Returns:
        tuple: (id, name, problem, problem_tier, time, level, repeatation)
    """
    sql = "SELECT * FROM problem WHERE name = %s"
    rows = __cursor.execute(sql, (username))
    return __cursor.fetchall()

def get_problems_by_event(event_id: int):
    sql = 'SELECT problem FROM event_problem WHERE event_id = %s'
    __cursor.execute(sql, event_id)
    return tuple(p[0] for p in __cursor.fetchall())

def get_problems_solved_today(name: str, time: datetime.datetime):
    sql = "SELECT * FROM problem WHERE name = %s AND time >= %s AND time < %s"

    today = datetime.datetime(time.year, time.month, time.day)
    tomorrow = time.date() + datetime.timedelta(days=1)

    __cursor.execute(sql, (name, today, tomorrow))
    return __cursor.fetchall()

def get_score_gained_today(user_id: int, time: datetime.datetime):
    sql = """
        SELECT * FROM score_history 
        WHERE user_id = %s 
        AND created_at >= %s 
        AND created_at < %s 
        AND event_id IS NULL 
        AND problem_id IS NOT NULL
    """

    today = datetime.datetime(time.year, time.month, time.day)
    tomorrow = today + datetime.timedelta(days=1)

    __cursor.execute(sql, (user_id, today, tomorrow))
    return __cursor.fetchall()

def get_repeat_time(name: str, problem: int) -> int:
    sql = "SELECT problem FROM problem WHERE name = %s AND problem = %s"
    rows = __cursor.execute(sql, (name, problem))
    return rows

def get_users_by_problem(problem_id: int) -> tuple:
    """
    특정 문제 번호의 데이터를 가져온다.
    Args:
        problem_id (int): 문제 번호

    Returns:
        tuple: (id, name, problem, problem_tier, time, level, repeatation)
    """
    sql = "SELECT * FROM problem WHERE problem = %s"
    rows = __cursor.execute(sql, (problem_id))
    return __cursor.fetchall()

def get_bias():
    sql = """SELECT user_id, total_point FROM user_bias_total"""
    __cursor.execute(sql)
    return __cursor.fetchall()

def get_user_bias(user_id: int):
    sql = 'SELECT total_point FROM user_bias_total WHERE user_id = %s'
    __cursor.execute(sql, user_id)
    row = __cursor.fetchone()
    if row:
        return row[0]
    else:
        return 0
    
from dateutil.relativedelta import relativedelta
def get_ranked_time(time: datetime.datetime) -> int:
    start = datetime.datetime(time.year, time.month, 1)
    end = start + relativedelta(months=1)
    sql = "SELECT COUNT(*) FROM ranking_boards WHERE created_at >= %s AND created_at < %s"
    __cursor.execute(sql, (start, end))
    count = __cursor.fetchone()[0]
    return count + 1

def get_user_tier(user_id: int):
    sql = 'SELECT tier FROM user WHERE id = %s'
    __cursor.execute(sql, user_id)
    return __cursor.fetchone()[0]

def update_user_bias(user_id: int, bias: int, time: datetime):
    row = get_user_bias(user_id)
    sql = ''
    if row == 0:
        sql = "INSERT INTO user_bias_total (total_point, updated_at, user_id) VALUES (%s, %s, %s)"
    else:
        sql = "UPDATE user_bias_total SET total_point = %s, updated_at = %s WHERE user_id = %s"
    __cursor.execute(sql, (bias, time, user_id))

def add_user_tier(user_id: int, tier: int):
    sql = 'UPDATE user SET tier = %s WHERE id = %s'
    __cursor.execute(sql, (tier, user_id))

def add_ranking_board(ranked_time: int, time: datetime.datetime):
    sql = 'INSERT INTO ranking_boards (title, created_at) VALUES (%s, %s)'
    __cursor.execute(sql, (f"{time.year}년 {time.month}월 {ranked_time}회차 추첨결과", time))
    return __cursor.lastrowid

def add_ranked_user(board_id: int, rank: int, user_id: int):
    sql = 'INSERT INTO ranked_users (board_id, `rank`, user_id) VALUES (%s, %s, %s)'
    __cursor.execute(sql, (board_id, rank, user_id))

def is_ignored(user_id: int) -> bool:
    sql = 'SELECT ignored FROM user WHERE id = %s'
    __cursor.execute(sql, user_id)
    return __cursor.fetchone()[0] == 1

def get_all_urls() -> tuple :
    sql = 'SELECT id, url FROM hook WHERE ignored = 0'
    __cursor.execute(sql)
    return __cursor.fetchall()

def set_url_ignored (url_ids: [int]) -> None :
    placeholders = ','.join(['%s'] * len(url_ids))
    sql = f'UPDATE hook SET ignored = 1 WHERE id IN ({placeholders})'
    __cursor.execute(sql, tuple(url_ids))
    conn.commit()

def get_name_by_id(id: int) -> str:
    sql = 'SELECT name FROM user WHERE id = %s'
    __cursor.execute(sql, (id))
    return __cursor.fetchone()[0]

    
"""
#디버깅용 삭제 쿼리
def delete_user_info(name: str):
    sql = "DELETE FROM user WHERE name = %s"
    __cursor.execute(sql, name)
    sql = "DELETE FROM problem WHERE name = %s"
    __cursor.execute(sql, name)
    conn.commit()

#디버깅용 이벤트 추가 쿼리
def add_event(begin: datetime.datetime, end: datetime.datetime, title: str):
    sql = 'INSERT INTO event (begin, end, title, created_at) VALUES (%s, %s, %s, %s)'
    __cursor.execute(sql, (begin, end, title, datetime.datetime.now()))
    conn.commit()

def add_event(begin: datetime.datetime, end: datetime.datetime, title: str, problem_list: list):
    sql = 'INSERT INTO event (begin, end, title, created_at) VALUES (%s, %s, %s, %s)'
    __cursor.execute(sql, (begin, end, title, datetime.datetime.now()))
    conn.commit()
    event_id = __cursor.lastrowid
    for problem in problem_list:
        add_event_problem(event_id, problem, datetime.datetime.now())

def get_event_problem():
    sql = 'SELECT * FROM event_problem'
    __cursor.execute(sql)
    return __cursor.fetchall()

def delete_event_problem():
    sql = 'DELETE FROM event_problem'
    __cursor.execute(sql)
    sql = 'DELETE FROM event'
    __cursor.execute(sql)
    conn.commit()

#디버깅용 이벤트 문제 추가 쿼리
def add_event_problem(event_id: int, problem: int, time: datetime.datetime):
    sql = 'INSERT INTO event_problem (event_id, problem, created_at) VALUES (%s, %s, %s)'
    __cursor.execute(sql, (event_id, problem, time))
    conn.commit()"""

#def test():
#    sql = """SELECT * FROM user_bias_total"""
#    __cursor.execute(sql)
#    print(__cursor.fetchall())

# print(update_user("qwe", 12, 2, 3))
# print(get_user("awj1052"))
# print(add_problem("awj1052", 2, datetime.datetime.now()))
# print(get_problems("awj1052"))


#open_db()

#add_event(datetime.datetime(2025, 8, 1), datetime.datetime(2025, 8, 7), 'TEST', [2525, 2530, 2675, 2558, 2557, 10869])
#add_event(datetime.datetime(2025, 8, 1), datetime.datetime(2025, 8, 7))
#add_event(datetime.datetime(2025, 8, 7), datetime.datetime(2025, 8, 9))
#add_event(datetime.datetime(2025, 7, 1), datetime.datetime(2025, 7, 7))

#print(get_event_problems(datetime.datetime.now()))

#print(get_score_gained_today(282, datetime.dat#etime.now()))

#delete_event_problem()
#print(get_event_problem())
#delete_user_info('pollux040610')
#close_db()