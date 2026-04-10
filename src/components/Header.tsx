import Link from 'next/link'
import styles from './Header.module.css'

interface HeaderProps {
  /** Show login/logout area on the right */
  rightContent?: React.ReactNode
}

export default function Header({ rightContent }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.content}>
        <Link href="/" className={styles.logo}>
          Distilink
        </Link>
        {rightContent && <div className={styles.right}>{rightContent}</div>}
      </div>
    </header>
  )
}
