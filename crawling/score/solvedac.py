import time, schedule, os, sys, datetime
from info import group_rank, user_info, solvedac_api
from repository import service
import broadcast, logger
from logger import msg, warning, error, debug, LogLevel

logger.set_level(LogLevel.DEBUG)

problems_tier = {}
db_people = {}

def load_db():
    global db_people
    for id, name, corrects, submissions, solution, kr_name, atcoder_handle, codeforce_handle, tier, ignored in service.get_user():
        db_people[name] = (corrects, submissions, solution)

def do_crawling(name, corrects, submissions):
    msg(f'{name}님의 정보를 가져오는 중입니다.')
    if corrects == 0: return  # 맞힌 문제가 0이면 탐색 안함

    user_tier = 0
    date_time = datetime.datetime.now()

    if name in db_people:
        if db_people[name][1] == submissions: return  # 제출 수 변화가 없으면 탐색 안함
        user_id = service.get_user_id(name)
        data = user_info.recent_solved_problems(name, db_people[name][2])

        user_tier = solvedac_api.user_tier(name)
        
        last_solution = db_people[name][2]
        for solution, problem, date_time in data:
            last_solution = max(last_solution, solution)
            if not problem in problems_tier:
                problems_tier[problem] = solvedac_api.problem_tier(problem)

            level = problems_tier[problem] - user_tier
            #print(level)
            #print(service.is_solved_before(name, problem))
            #print(service.has_got_score_today(name, date_time))
            problem_id = service.add_problem(name, problem, problems_tier[problem], date_time, level)
            
            if not service.is_solved_before(name, problem) and not service.has_score_today(user_id, date_time) and level >= -5:
                service.scored_by_problem(user_id, problem, problem_id, date_time)
                msg(f'{name}님이 {problem}번 문제를 풀어 1점을 획득하였습니다.')
            
            if service.is_eventing_problem(problem, date_time):
                ongoing_events = service.get_ongoing_events(date_time)
                for event_id in ongoing_events:
                    if service.is_first_solve_in_event_period(name, user_id, event_id, problem) and service.is_problem_in_event(event_id, problem):
                        msg(f'{name}님이 이벤트 {event_id}의 {problem}번 문제를 풀어 1점을 획득하였습니다.')
                        service.scored_by_event(user_id, event_id, problem, problem_id, date_time)

        service.update_user(name, corrects, submissions, last_solution, user_tier)
        msg(f'{name}님 정보의 업데이트가 완료되었습니다. (새로 푼 문제 수: {len(data)})')

    else:
        solution = user_info.last_solution(name, "init")
        user_tier = solvedac_api.user_tier(name)
        service.update_user(name, corrects, submissions, solution, user_tier)

        problems = user_info.solved_problems(name, "init")
        for problem in problems:
            if not problem in problems_tier:
                problems_tier[problem] = solvedac_api.problem_tier(problem)
            level = problems_tier[problem] - user_tier
            service.add_problem(name, problem, problems_tier[problem], datetime.datetime(1970,1,1), level)

        msg(f'{name}님 정보를 초기화 했습니다. (맞힌 문제 수: {corrects}, 제출 수: {submissions})')
    service.db_commit()