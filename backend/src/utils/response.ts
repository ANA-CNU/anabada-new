export const createSuccessResponse = <T>(data: T, message?: string) => {
  return new Response(JSON.stringify({ data, message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const createErrorResponse = (error: string, status: number = 400) => {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const createNotFoundResponse = (error: string = '리소스를 찾을 수 없습니다.') => {
  return createErrorResponse(error, 404);
};

export const createServerErrorResponse = (error: string = '서버 오류') => {
  return createErrorResponse(error, 500);
};
