import requests, os, datetime, time
from dotenv import load_dotenv
load_dotenv()

USER_INFO = os.getenv("USER_INFO")
USER_SUBMISSION = os.getenv("USER_SUBMISSION")

# for init
def solved_problems(username, key):
    if key != "init": raise ValueError("key가 올바르지 않음")
    response = requests.get(
        url = f'{USER_INFO}/{username}',
        headers = {
            "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        },
    )

    html = response.text

    problem_list = html.find('<div class="problem-list">') + 26 # 26 letters
    problem_list_end = html.find("</div>", problem_list)
    html = html[problem_list:problem_list_end].replace('<a href="/problem/', '').replace('" class="">', ' ').replace('</a>', ' ')
    problems = list(set(map(int,html.split())))
    return problems

def last_solution(username, key):
    if key != "init": raise ValueError("key가 올바르지 않음")
    response = requests.get(
        url = f'{USER_SUBMISSION}user_id={username}',
        headers = {
            "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        },
    )

    html = response.text

    table = html.find('status-table">') + 14
    table = html.find('<tbody>', table) + 7
    table_end = html.find('</tbody>', table)
    html = html[table:table_end].split('</tr>')

    line = html[0]
    elements = line.split('</td>')
    solution = int(elements[0].split('<td>')[1])
    return solution

# time = "2024-08-25 19:52:59"
# time = datetime.datetime.strptime(time, "%Y-%m-%d %H:%M:%S")
def str2datetime(s='epoch'):
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except:
        return datetime.datetime.fromtimestamp(0) # epoch time

called = 0
def recent_solved_problems(username, last_solution):
    global called
    called = 0
    return __recent_solved_problems(username, last_solution)

def __recent_solved_problems(username, last_solution, query=''):
    global called
    called += 1
    if called > 4:
        return []
    response = requests.get(
        url = f'{USER_SUBMISSION}user_id={username}&{query}',
        headers = {
            "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        },
    )

    html = response.text

    table = html.find('status-table">') + 14
    table = html.find('<tbody>', table) + 7
    table_end = html.find('</tbody>', table)
    html = html[table:table_end].split('</tr>')
    html.pop()

    data = []
    solution = 0
    flag = 1
    for line in html:
        try:
            elements = line.split('</td>')
            if not "result-ac" in elements[3]: continue # check if it is AC
            solution = int(elements[0].split('<td>')[1])
            if solution <= last_solution:
                flag = 0
                break
            problem_id = int(elements[2].split('" rel')[0].replace('<td><a href="/problem/', ''))
            time_value = str2datetime(elements[8].split('" data-timestamp')[0].split('title="')[1])
            data.append((solution, problem_id, time_value))
        except:
            continue
    if flag:
        time.sleep(0.1)
        data = data + __recent_solved_problems(username, last_solution, 'top=' + str(solution-1))
    return data

# www.acmicpc.net/status?user_id=tjgus1668&result_id=4&top=90716579
# res = __recent_solved_problems("tjgus1668", 90581335,"top=90716579")
# print(*res)

if __name__ == "__main__":
    data = recent_solved_problems("awj1052", 82340610)
    print(len(data))
    print(*data, sep='\n')
    # (solution, problem_id, datetime)

    print(str2datetime("2024-08-25 19:52:59"))
