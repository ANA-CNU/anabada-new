export function needsLogin({ url, loginRequiredVisible }) {
  return url.includes("/auth/signin") || loginRequiredVisible;
}
