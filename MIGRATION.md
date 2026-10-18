# Minrock migration

This branch replaces the previous website with the complete upstream
[Minrock starter](https://github.com/rnt-rez/minrock), including its pages,
components, styles, scripts, example content, and Obsidian resources. Only
`ping-pong.md` and its six images were carried over from the previous website.

## Handoff status: incomplete

The user still reports that the local design is not responsive. The migration
is not accepted and the responsive work remains unresolved. Do not treat a
successful build or the previous viewport measurements as visual acceptance.

Review the actual running site against https://minrock.vercel.app/ at matching
phone, tablet, and desktop widths, including sizes between breakpoints.
The local changes to inspect against upstream are:

- `src/components/Header.astro`: navigation wrapping and a grid below 1000px,
  with a further stacking rule below 480px.
- `src/components/AudioPlayer.astro`: flex sizing and status badge wrapping.
- `src/pages/about.astro`: a scroll container around the table.
- `src/styles/global.css`: image constraints and long article URL wrapping.
- `src/config/site.ts`: personal identity and comments disabled.
- `src/content/blog/ping-pong.md` and six images in `public/images/`: the only
  content migrated from the previous website.

`npm run qa` completed with no errors or warnings and two upstream hints. Browser
measurements covered six routes at 19 widths, but their assertions only checked
page overflow and title wrapping; they did not establish overall design quality
or correct behavior on physical devices or Safari. A development server restart
was needed after it served stale CSS during review.

## Current structure

There is no theme submodule, generated application, or separate override layer.
The full upstream starter is retained, with the local adjustments listed above.
Comments are disabled until this blog's own discussion service is configured;
the complete comment implementation remains in the repository.
Run the upstream commands directly:

```sh
npm ci
npm run dev
npm run qa
```

The upstream starter's example articles and projects are retained so the full
theme can be reviewed locally. They are not imported legacy content. The site
has not been published. Confirm the production URL and real content before
deployment; set `SITE_URL` in the hosting environment as described in README.md.

## Future upstream updates

The migration commit has both the previous site's history and Minrock's history
as parents. This provides a shared ancestor for ordinary upstream merges:

```sh
git fetch minrock-upstream
git merge minrock-upstream/main
npm ci
npm run qa
```

For a fresh clone, first register the upstream remote if it is missing:

```sh
git remote add minrock-upstream https://github.com/rnt-rez/minrock.git
```

Resolve any conflicts in personal configuration or content, and review the local
site before publishing. Keep theme changes small to simplify later merges.
The previous website remains recoverable from `main`.
