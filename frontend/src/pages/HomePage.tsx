import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon, type IconName } from '../components/Icon'

export function HomePage() {
  const { user, loading } = useAuth()

  // Auth status isn't known yet on first paint (e.g. right after a refresh) —
  // render nothing rather than flash the logged-out page and then swap it out.
  if (loading) return null

  if (!user) {
    return (
      <div className="stack home-stack">
        <div className="home-hero">
          <h1 className="page-title home-title">Markdown in any shape you need.</h1>
          <p className="home-lede">
            Write plain markdown, tag it with a <code>kind</code>, and skdoctool renders it as a doc, a
            decision tree, or a quiz. Create an account with just a username and password — no email needed.
          </p>
          <div className="row">
            <Link to="/register"><button className="primary">Create an account</button></Link>
            <Link to="/explore"><button>Explore public files</button></Link>
          </div>
        </div>

        <div className="feature-grid">
          <FeatureCard
            icon="shield"
            title="No email required"
            body="Start with just a username and password."
          />
          <FeatureCard
            icon="layers"
            title="One format, any shape"
            body="Create docs, decision trees, or quizzes using plain text. Custom layouts render automatically behind the scenes."
          />
          <FeatureCard
            icon="history"
            title="Full history, line-by-line comparison"
            body="Every save creates an exact snapshot. Easily compare any two past versions side by side to see changes over time."
          />
          <FeatureCard
            icon="check-circle"
            title="Reviewed before it's live"
            body="Anyone can suggest edits. Review and accept changes line by line before updating the page."
          /> 
        </div>
      </div>
    )
  }

  return (
    <div className="stack home-stack">
      <h1 className="page-title">Welcome back, @{user.username}</h1>
      <div className="feature-grid">
        <FeatureLinkCard
          to="/files/new"
          icon="plus"
          title="New file"
          body="Start a doc, decision tree, or quiz."
          accent
        />
        <FeatureLinkCard to="/files" icon="folder" title="My files" body="Everything you own or can edit." />
        <FeatureLinkCard
          to="/explore"
          icon="compass"
          title="Explore public files"
          body="See what other people have published."
        />
        <FeatureLinkCard
          to={`/u/${user.username}`}
          icon="user"
          title="My profile"
          body="Edit your bio and social links."
        />
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="feature-card">
      <span className="feature-card-icon">
        <Icon name={icon} />
      </span>
      <div className="feature-card-title">{title}</div>
      <p className="feature-card-body">{body}</p>
    </div>
  )
}

function FeatureLinkCard({
  to,
  icon,
  title,
  body,
  accent,
}: {
  to: string
  icon: IconName
  title: string
  body: string
  accent?: boolean
}) {
  return (
    <Link to={to} className={`feature-card${accent ? ' feature-card-accent' : ''}`}>
      <span className="feature-card-icon">
        <Icon name={icon} />
      </span>
      <div className="feature-card-title">{title}</div>
      <p className="feature-card-body">{body}</p>
    </Link>
  )
}
