# GitHub AI Bug Hunter 🤖🐛

A GitHub profile animation where a yellow AI robot moves through your real GitHub contribution grid and "fixes" green bugs.

This package is preconfigured to work in a GitHub profile repository such as `allimist/allimist`.

## Install

Copy these two folders/files into the root of your profile repository:

```text
.github/workflows/ai-bug-hunter.yml
ai-bug-hunter/package.json
ai-bug-hunter/generate.mjs
```

Your repository should look like:

```text
allimist/
├── README.md
├── .github/
│   └── workflows/
│       └── ai-bug-hunter.yml
└── ai-bug-hunter/
    ├── generate.mjs
    └── package.json
```

Commit and push:

```bash
git add .
git commit -m "Add AI Bug Hunter contribution animation"
git push
```

## Run it

On GitHub open:

**Repository → Actions → AI Bug Hunter → Run workflow**

After the workflow succeeds, GitHub creates an `output` branch containing:

```text
github-ai-bug-hunter.svg
github-ai-bug-hunter-dark.svg
```

It also regenerates automatically every day.

## Add it to your profile README

For `allimist/allimist`, paste this into the profile `README.md`:

```html
<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://raw.githubusercontent.com/allimist/allimist/output/github-ai-bug-hunter-dark.svg"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://raw.githubusercontent.com/allimist/allimist/output/github-ai-bug-hunter.svg"
    />
    <img
      alt="AI Robot hunting bugs in my GitHub contributions"
      src="https://raw.githubusercontent.com/allimist/allimist/output/github-ai-bug-hunter.svg"
    />
  </picture>
</p>
```

## Local test

If you want to generate it locally, create a GitHub personal access token that can read public user data, then run:

```bash
cd ai-bug-hunter
GITHUB_USER=allimist GITHUB_TOKEN=YOUR_TOKEN npm run generate
```

The SVGs will be written to `ai-bug-hunter/dist/` unless `OUT_DIR` is set.

## Notes

- No server or database is required.
- GitHub Actions runs the generator for you.
- The contribution data comes from GitHub's GraphQL API.
- The animation uses the real contribution calendar of the repository owner.
