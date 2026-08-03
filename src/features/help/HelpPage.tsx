import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { PageHeader } from '@/components/AppShell'
import { slug } from './slug'
// The operator guide is imported as raw text rather than copied into a
// component, so docs/ALUR-KERJA.md stays the single source. Editing the
// markdown updates this page, and the two can never drift apart.
import guide from '@docs/ALUR-KERJA.md?raw'

const textOf = (children: ReactNode): string =>
  Array.isArray(children) ? children.join('') : String(children ?? '')

const heading =
  (level: 1 | 2 | 3, className: string) =>
  ({ children }: { children?: ReactNode }) => {
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
    // scroll-mt keeps the target clear of the sticky mobile header
    return (
      <Tag id={slug(textOf(children))} className={`scroll-mt-20 ${className}`}>
        {children}
      </Tag>
    )
  }

const REPO = 'https://github.com/ismailsunni/bmis/blob/main'

function Anchor({ href, children }: ComponentPropsWithoutRef<'a'>) {
  // In-page anchors stay native so the browser handles scrolling; links to repo
  // files would 404 inside the app, so they point at GitHub instead.
  const isInPage = href?.startsWith('#')
  const target = href?.endsWith('.md') ? `${REPO}/${href.replace(/^\.\.\//, '')}` : href
  return (
    <a
      href={target}
      className="text-brand-700 underline decoration-brand-300 hover:decoration-brand-700 dark:text-brand-400"
      {...(isInPage ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </a>
  )
}

export function HelpPage() {
  return (
    <>
      <PageHeader
        title="Bantuan"
        subtitle="Panduan alur kerja: mencatat donasi, verifikasi, penyaluran, laporan bulanan"
        action={
          <button
            onClick={() => window.print()}
            className="no-print rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Cetak
          </button>
        }
      />

      <article className="max-w-3xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: heading(1, 'mt-8 mb-3 text-xl font-bold text-slate-900 dark:text-slate-50'),
            h2: heading(
              2,
              'mt-8 mb-3 border-b border-slate-200 pb-1 text-lg font-bold text-slate-900 dark:border-slate-700 dark:text-slate-50',
            ),
            h3: heading(3, 'mt-6 mb-2 font-semibold text-slate-900 dark:text-slate-100'),
            p: ({ children }) => <p className="my-3">{children}</p>,
            ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="pl-1">{children}</li>,
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900 dark:text-slate-50">
                {children}
              </strong>
            ),
            a: Anchor,
            code: ({ children }) => (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-r-lg border-l-4 border-brand-500 bg-brand-50 py-2 pl-4 pr-3 dark:bg-brand-900/20">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-8 border-slate-200 dark:border-slate-700" />,
            // reuse the app's table styling so help tables match every other table
            table: ({ children }) => (
              <div className="table-wrap my-4">
                <table className="tbl">{children}</table>
              </div>
            ),
            th: ({ children }) => <th>{children}</th>,
            td: ({ children }) => <td>{children}</td>,
          }}
        >
          {guide}
        </Markdown>
      </article>
    </>
  )
}
