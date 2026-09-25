import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const roots = ['src', 'dev', 'scripts']
const ignored = new Set(['node_modules', '.next', 'app', 'media'])
const ignoredFiles = new Set(['next-env.d.ts', 'payload-types.ts'])
const extensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs']
const cssExtensions = ['.css', '.scss']

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return ignored.has(entry) ? [] : walk(path)
    }
    return ignoredFiles.has(entry) ? [] : [path]
  })

const findScriptComments = (path, source) => {
  const kind = path.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, kind, source)
  const found = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      found.push(scanner.getTokenStart())
    }
    token = scanner.scan()
  }
  return found
}

const findCssComments = (source) => {
  const found = []
  const pattern = /\/\*/g
  let match
  while ((match = pattern.exec(source))) {
    found.push(match.index)
  }
  return found
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length

const violations = roots
  .flatMap((root) => walk(root))
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    const positions = extensions.some((ext) => path.endsWith(ext))
      ? findScriptComments(path, source)
      : cssExtensions.some((ext) => path.endsWith(ext))
        ? findCssComments(source)
        : []
    return positions.map((index) => `${relative('.', path)}:${lineOf(source, index)}`)
  })

if (violations.length > 0) {
  console.error(`Code comments are not allowed in this project:\n${violations.join('\n')}`)
  process.exit(1)
}

console.log('No code comments found.')
