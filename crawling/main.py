from info import group_rank, user_info, solvedac_api
from repository import service
from score import solvedac
import broadcast, logger
from ssh_tunnel import open_ssh_tunnel
from logger import msg, warning, error, debug, LogLevel
import datetime

logger.set_level(LogLevel.DEBUG)
pre_lotto = []

def init():
    global pre_lotto
    service.open_db()
    scores = service.get_bias()
    ranks = service.get_score_and_rank(list(scores.items()))
    filtered_ranks = service.filter_ignored(ranks)
    pre_lotto = service.get_shuffle(filtered_ranks)
    service.close_db()

def update_bias():
    global pre_lotto
    msg("크롤링 시작...")
    service.open_db()
    date_time = datetime.datetime.now()

    #추후에 크롤링 서버를 분리해서 처리 가능
    people = group_rank.get_group_member()
    solvedac.load_db()
    for name, corrects, submissions in people:
        solvedac.do_crawling(name, corrects, submissions)
        # time.sleep(0.3)

    service.update_bias()

    scores = service.get_bias()
    ranks = service.get_score_and_rank(list(scores.items()))
    filtered_ranks = service.filter_ignored(ranks)
    lotto: list[tuple] = service.get_shuffle(filtered_ranks)
    if pre_lotto != lotto:
        msg("추첨 결과가 바뀌어 디스코드에 알림을 보냅니다.")
        pre_lotto = lotto

        service.save_ranking(lotto, date_time)
        broadcast.broadcast(lotto)
    else:
        msg("추첨 결과 변화가 없어 디스코드 알림을 보내지 않습니다.")


    service.db_commit()
    service.close_db()
    msg("크롤링 완료!")

def lambda_handler(event, context):
    try:
        with open_ssh_tunnel():
            init()
            msg("Hello, World!")
            update_bias()
        return {
            "statusCode": 200,
            "body": "Success"
        }
    except Exception as e:
        logger.error(f"Error: {e}")
        return {
            "statusCode": 500,
            "body": "error"
        }
