"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileValues } from "./actions";
import styles from "./settings.module.css";

const fields = [
  { id: "name", label: "이름", required: true, max: 25, placeholder: "이름" },
  { id: "atcoder", label: "AtCoder 핸들", required: false, max: 50, placeholder: "AtCoder 사용자명" },
  { id: "codeforces", label: "Codeforces 핸들", required: false, max: 50, placeholder: "Codeforces 사용자명" },
] as const;

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action, pending] = useActionState(saveProfile, { values: profile });
  return (
    <form action={action} className={styles.form}>
      {fields.map(({ id, label, required, max, placeholder }) => {
        const error = state.fields?.[id]?.[0];
        return (
          <div className={styles.field} key={id}>
            <label htmlFor={id}>{label}</label>
            <input
              id={id} name={id} defaultValue={state.values[id]} required={required} maxLength={max}
              placeholder={placeholder} autoComplete={id === "name" ? "name" : "off"}
              aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && <p id={`${id}-error`} className={styles.error}>{error}</p>}
          </div>
        );
      })}
      <div className={styles.actions}>
        <button className="site-button site-button-primary" type="submit" disabled={pending}>
          {pending ? "저장 중…" : "변경사항 저장"}
        </button>
        {state.saved && <p role="status">프로필을 저장했습니다.</p>}
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
      </div>
    </form>
  );
}
