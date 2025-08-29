import time, schedule, os, sys
from info import group_rank, user_info, solvedac_api
from repository import service
from score import solvedac
import broadcast, logger
from logger import msg, warning, error, debug, LogLevel
import datetime

logger.set_level(LogLevel.DEBUG)

service.open_db()
scores = service.get_bias()
ranks = service.get_score_and_rank(list(scores.items()))
pre_lotto = service.get_shuffle(ranks)
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
    lotto: list[tuple] = service.get_shuffle(ranks)
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

msg("Hello, World!")
update_bias()

schedule.every().hour.at(":00").do(update_bias)
schedule.every().hour.at(":05").do(update_bias)
schedule.every().hour.at(":10").do(update_bias)
schedule.every().hour.at(":15").do(update_bias)
schedule.every().hour.at(":20").do(update_bias)
schedule.every().hour.at(":25").do(update_bias)
schedule.every().hour.at(":30").do(update_bias)
schedule.every().hour.at(":35").do(update_bias)
schedule.every().hour.at(":40").do(update_bias)
schedule.every().hour.at(":45").do(update_bias)
schedule.every().hour.at(":50").do(update_bias)
schedule.every().hour.at(":55").do(update_bias)

while True:
    schedule.run_pending()
    time.sleep(1)