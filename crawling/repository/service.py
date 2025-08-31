from repository import db
import datetime, random, os, pytz
from dotenv import load_dotenv
load_dotenv()

RANDOM_SEED = os.getenv("RANDOM_SEED")
timezone = pytz.timezone('Asia/Seoul')

def get_score_and_rank(data):
    """
    score 기반으로 내림차순 sorting, score 같다면 이름 오름차순
    Args:
        data (list of tuples): (name, score).
    Returns:
        list of tuples: 정렬된 (이름, 점수) 리스트
    """
    data.sort(key=lambda x : (-x[1], x[0]))
    return data

def get_shuffle(ranks):
    """
    월별(seed) 및 가중치(score)에 기반해 사용자 목록을 섞어(shuffle) 반환

    Args:
        ranks (list of tuples): (이름, 점수) 리스트
    Returns:
        list of tuples: 가중치를 반영해 셔플된 중복 제거 리스트
    """
    now = datetime.datetime.now(timezone).replace(tzinfo=None)
    year = now.year
    month = now.month
    seed = f'{RANDOM_SEED}-{year * 100 + month}'
    weighted_user = []
    total = 0
    for name, score in ranks:
        total += score
        weighted_user.extend([(name, score)] * int(score ** 1.05))
    seed = seed + f'-{total}'
    random.seed(seed)
    random.shuffle(weighted_user)
    shuffled = list(dict.fromkeys(weighted_user))
    res = [(name, score) for name, score in shuffled]
    return res

def filter_ignored(ranks):
    return [(user_id, score) for user_id, score in ranks if not db.get_user_ignored(user_id)]

def update_bias():
    """
    월별 점수 이력을 합산하여 사용자 점수를 계산하고 변화가 있으면 데이터베이스 업데이트
    """

    kst_now = datetime.datetime.now(timezone)
    score_history = db.get_score_history_by_month(kst_now)
    bias_total = {}

    for user_id, score in score_history:
        if not user_id in bias_total:
            bias_total[user_id] = score
        else:
            bias_total[user_id] += score

    for user_id in bias_total:
        if bias_total[user_id] != db.get_user_bias(user_id):
            db.update_user_bias(user_id, bias_total[user_id], datetime.datetime.now(timezone))

def is_eventing_problem(problem: int, time: datetime.datetime) -> bool:
    """
    현재 이 문제가 이벤트 중인 문제인지 확인
    Args:
        problem (int): 문제 번호
        time (datetime): 시간
    Returns:
        bool: 이벤트 중인 문제라면 True
    """

    event_problems = db.get_event_problems(time)
    return problem in event_problems

def is_first_solve_in_event_period(name: str, user_id: int, event_id: int, problem: int) -> True:
    """
    이벤트 기간 동안 처음 푼 문제인지 확인
    score_history에서 event_id와 problem_id가 모두 일치하는 점수 기록이 있는지 확인
    Args:
        name (str): 사용자 아이디
        user_id (int): 사용자 식별 번호
        event_id (int): 이벤트 식별 번호
        problem (int): 문제 번호
    Returns:
        bool: 이벤트 중에 처음 푼 문제라면 True 반환
    """
    problem_ids = db.get_problem_id_by_user(name, problem)
    scored_problem = [p[5] for p in db.get_user_score_history_by_event(user_id, event_id)]

    for problem_id in problem_ids:
        if problem_id in scored_problem: return False
    return True

def is_problem_in_event(event_id: int, problem: int) -> bool:
    """
    문제가 event_id 이벤트의 문제인지 확인
    Args:
        event_id (int): 이벤트 식별 번호
        problem (int): 문제 번호
    Returns:
        bool: problem이 event_id 이벤트의 문제라면 true반환
    """
    return problem in db.get_problems_by_event(event_id)

def is_solved_before(name: str, problem: int) -> bool:
    """
    사용자가 이전에 문제를 풀었는지 검사
    Args: 
        name (str): 사용자 아이디
        problem (int): 문제 번호
    Returns:
        bool: 사용자가 이미 문제를 푼 적이 있다면 True 반환
    """
    repeatation = db.get_repeat_time(name, problem)
    return repeatation != 1

def has_score_today(user_id: int, time: datetime) -> bool:
    """
    오늘 문제를 풀어서 점수를 얻었는지 확인
    Args:
        user_id (int): 사용자 아이디
        problem (int): 문제 번호
    Returns:
        bool: 사용자가 오늘 이미 점수를 얻었다면 True 반환
    """
    problems = db.get_score_gained_today(user_id, time)
    return len(problems) != 0

def scored_by_problem(user_id: int, problem: int, problem_id: int, time: datetime.datetime):
    """
    문제를 풀어 점수를 얻었다면 score_history에 기록
    """
    db.add_score_history(user_id, f'{problem}번 문제 해결', 1, None, problem_id, time)

def scored_by_event(user_id: int, event_id: int, problem: int, problem_id: int, time: datetime.datetime):
    """
    이벤트 문제를 풀어 점수를 얻었다면 score_history에 기록
    """
    db.add_score_history(user_id, f"Event(#{event_id})의 {problem}번 문제 해결", 1, event_id, problem_id, time)

def save_ranking(lotto: list, time: datetime.datetime):
    ranked_time = db.get_ranked_time(time)
    board_id = db.add_ranking_board(ranked_time, time)

    rank = 0
    for user_id, score in lotto:
        if db.is_ignored(user_id): continue
        rank += 1
        db.add_ranked_user(board_id, rank, user_id)

def open_db():
    db.open_db()

def close_db():
    db.close_db()

def db_commit():
    db.db_commit()

def get_user_id(name: str):
    return db.get_user_id(name)

def get_user_tier(user_id: int):
    return db.get_user_tier(user_id)

def get_problem_id(problem: int):
    return db.get_problem_id(problem)

def get_ongoing_events(time: datetime.datetime):
    return db.get_ongoing_events(time)

def update_user(username: str, corrects: int, submissions: int, solution: int, user_tier: int) -> int:
    db.update_user(username, corrects, submissions, solution, user_tier)

def update_user_tier(user_id, tier: int):
    db.add_user_tier(user_id, tier)

def add_problem(username: str, problem_id: int, level: int, problem_tier: int, time = datetime.datetime.fromtimestamp(0)) -> int:
    return db.add_problem(username, problem_id, level, problem_tier, time)
    
def get_user():
    return db.get_user()

def get_bias():
    data = {}
    for e in db.get_bias():
        data[e[0]] = e[1]
    return data
