Title: Two-Factor Authentication
Category: Configuration
Order: 3
Slug: two-factor-auth
Icon: lock
Summary: Add a second factor (a 6-digit code from an authenticator app) to sign-in, with one-time recovery codes so nobody gets locked out.

Two-factor authentication (2FA) adds a second step to signing in: after the
password, the portal asks for a 6-digit code from an authenticator app on your
phone. A stolen or guessed password is no longer enough on its own.

It's **optional and per-account**. Each person can turn it on for themselves,
and admins can require it for any account. New admin accounts have it required
by default; everyone else starts without it.

2FA here is standard **TOTP** (time-based one-time passwords, RFC 6238 — HMAC-
SHA1, 6 digits, 30-second period), so it works with any common authenticator
app: **2FAS**, Google Authenticator, Aegis, 1Password, and the rest. There's
nothing to install on the server beyond what ships in the box.

!!! note "Where the secret lives"
    The shared secret is **Fernet-encrypted at rest** (the same key system as
    Zoom and SMTP credentials, seeded from `TSP_SECRET_KEY`). It's generated
    server-side and only ever leaves the server as the QR image you scan —
    there's no client-side JavaScript the secret flows through. Code
    verification is constant-time so a wrong guess never leaks how close it was.

## Turning it on for yourself

Anyone, in any role, can enable 2FA for their own account:

1. Go to **Settings → Your Access**.
2. Choose **Turn on two-factor**.
3. Scan the QR code with your authenticator app — or, if you can't scan, type
   the **manual key** shown beneath it.
4. Enter the current **6-digit code** from the app to confirm the pairing.
5. **Save your recovery codes** (see below) somewhere safe, then finish.

From the next sign-in onward, you'll enter your password and then a code from
your app.

The label your authenticator shows for the account is the portal's name — it
comes from the **email "from" name** under Settings → Email if one is set, and
falls back to *Trusted Servants Pro* otherwise.

## Requiring it for other people (admins)

Admins can require 2FA on any account, in either of two places:

- **Settings → Users** — each user row has a **Two-factor** toggle. Flip it on
  to require 2FA for that account; flip it off to remove the requirement.
- **The Edit-user dialog** — the same **Require two-factor (2FA)** option, set
  when you create or edit a user.

A required account doesn't have to be enrolled by the admin. The next time that
person signs in, a **one-time setup wizard** walks them through scanning the QR
code, confirming a code, and saving their recovery codes.

The Users list shows where each account stands at a glance:

- **✓ (enrolled)** — 2FA is required *and* fully set up.
- **⏳ (awaiting setup)** — 2FA is required but the person hasn't finished the
  wizard yet.

!!! warning "Turning the requirement off clears existing 2FA"
    Switching a user's **Two-factor** toggle off doesn't just drop the
    requirement — it clears their stored secret and recovery codes. If they want
    2FA again afterward, they'll set it up fresh. This is also how a second
    admin rescues someone who has lost both their phone and their recovery codes
    (see *If you lose your device* below).

## The login experience

What a person sees at sign-in depends on their account:

- **2FA not required** — password only, as before.
- **2FA required and enrolled** — password, then a prompt for the 6-digit code
  (or a recovery code). Only after the code verifies are they signed in.
- **2FA required but not yet enrolled** — password, then the **setup wizard**.
  They can complete it, or choose **Skip for now** to sign in without 2FA this
  time. The wizard reappears at each login until they either enrol or an admin
  turns the requirement off.

!!! note "The lockout budget isn't reset by the password alone"
    The portal's failed-login lockout counter is only cleared once the *second
    factor* verifies — not when the password is accepted. So a stolen password
    can't be used to reset the lockout budget and grind away at the code prompt.

## Recovery codes

When you enable 2FA you're given **ten one-time recovery codes** (formatted like
`AB3KD-7MNP2`). Each one signs you in exactly once in place of an app code —
they're your way back in if your phone is lost or unavailable.

- **Save them when they're shown.** They appear only once, at the moment they're
  generated. Only their SHA-256 hashes are stored, so the plaintext can't be
  shown again or recovered later.
- **Each code works once.** Using one consumes it; the rest remain valid.
- **Regenerate anytime** from **Settings → Your Access → Regenerate recovery
  codes**. This issues a fresh set of ten and invalidates the old set. You'll
  confirm your account password first.

## Turning it off

Turn your own 2FA off under **Settings → Your Access → Turn off two-factor**.
You'll be asked for your **account password** first.

Requiring the password to disable 2FA (or to regenerate recovery codes) means an
unlocked, walked-up-to session can't quietly strip the second factor — and it
means you can still turn 2FA off even if your authenticator device is gone, as
long as you know your password.

## If you lose your device

In order of preference:

1. **Use a recovery code** at the login code prompt. It signs you in once; then
   set up your authenticator again and regenerate recovery codes.
2. **Ask another admin** to turn the **Two-factor** requirement off for your
   account under Settings → Users. That clears the stuck 2FA so you can sign in
   with just your password, then re-enrol.

!!! warning "The sole-admin case"
    If you're the only admin and you lose *both* your authenticator and every
    recovery code, no one else can clear the requirement for you. This is
    exactly what the recovery codes are for — store them somewhere separate from
    your phone (a password manager, a printout in a safe) when you enable 2FA.

## What gets logged

2FA events are recorded in the activity log for admin visibility: enabling and
disabling, regenerating recovery codes, the setup wizard being shown or skipped,
a successful code, a sign-in via recovery code, and failed code attempts.
