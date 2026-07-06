import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/audit', label: 'Audit' },
]

export default function Nav() {
  const { pathname } = useLocation()
  return (
    <nav className="relative z-10 flex flex-row items-center justify-between px-8 py-6 max-w-7xl mx-auto">
      <Link to="/" className="text-3xl tracking-tight text-foreground font-display">
        Deskmate<sup className="text-xs">®</sup>
      </Link>
      <div className="hidden md:flex items-center gap-8">
        {links.map(({ to, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`text-sm transition-colors ${
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
      <Link
        to="/approvals"
        className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform"
      >
        Approval inbox
      </Link>
    </nav>
  )
}
