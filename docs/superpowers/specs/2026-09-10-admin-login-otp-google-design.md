# Admin login: Email OTP + Google (no password)

## Goal
Make `/admin/login` passwordless: email OTP as the primary flow, keep Google sign-in.

## Design
- Default form: email → Send code → OTP → Sign in
- Keep Continue with Google below an OR divider
- Remove password fields, Remember me, Forgot password, and password mode switches
- Reuse existing Neon session routes: `send-code`, `verify-code`, `google`

## Out of scope
- Removing password from register / account settings / admin user reset
- Disabling Neon email/password at the provider level
