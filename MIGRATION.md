# Minrock migration

This branch replaces the previous website with the complete upstream
[Minrock starter](https://github.com/rnt-rez/minrock), including its pages,
components, styles, scripts, example content, and Obsidian resources. Only
`ping-pong.md` and its six images were carried over from the previous website.

There is no theme submodule, generated application, or separate override layer.
The upstream layouts are retained. Small responsive corrections allow header
links and long article URLs to wrap, and constrain images to the reading column.
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
