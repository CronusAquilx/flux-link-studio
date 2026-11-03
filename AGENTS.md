<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep AWS ARN parsing in `src/lib/arn.ts` and call it from the page, the CloudFormation builder and the server functions, so the same shape rules apply everywhere; a second copy drifts and rejects valid ARNs.
- Never put a regex repetition count above 255 in database SQL (patterns in triggers, policies, checks): PostgreSQL's regex engine caps counts at 255 and the statement fails at runtime, not at write time. Enforce long-string limits with `char_length()` instead.
