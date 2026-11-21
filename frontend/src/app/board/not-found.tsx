import { ArrowRight } from "lucide-react";
import Link from "next/link";
import styles from "./board.module.css";

export default function BoardNotFound() {
  return (
    <section className={`${styles.page} ${styles.readingPage}`}>
      <header className={styles.editorHeader}>
        <h1>글을 찾을 수 없어요.</h1>
        <p>주소가 바뀌었거나 삭제된 글입니다.</p>
      </header>
      <Link className={styles.secondary} href="/board">게시판으로 돌아가기 <ArrowRight size={18} aria-hidden="true" /></Link>
    </section>
  );
}
