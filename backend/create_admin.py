"""Create admin accounts in the database named in backend/.env.

    python create_admin.py <login> [<notify-email>] [<login> [<notify-email>] ...]
    e.g. python create_admin.py alice alice@example.com bob

<login> is what the person types on the login page (stored lowercase).
<notify-email> (optional: anything with an @ right after a login) is where the
app sends alert mail to them. Each new account
gets a random temporary password, printed ONCE here. An admin can set a new
one later in User Management. Accounts that already exist are left alone.

This is the only way to make the first account on a server. Never run seed.py
on a real server: it creates demo users that all share the password "pass".
"""
import secrets
import sys

from app.auth import hash_password
from app.db import SessionLocal, init_db
from app.models import ROLE_ADMIN, User
from app.services import log_action


def create_admins(db, pairs):
    """Create an admin for each (login, notify_email). Returns a list of
    (login, temporary_password) where the password is None if the login was
    already taken. The caller commits."""
    results = []
    for login, notify_email in pairs:
        login = login.strip().lower()
        if not login:
            raise ValueError("a login cannot be empty")
        if db.query(User).filter_by(email=login).first():
            results.append((login, None))
            continue
        password = secrets.token_urlsafe(12)
        user = User(name=login.title(), email=login, role=ROLE_ADMIN, active=True,
                    notify_email=notify_email.strip() or None,
                    password_hash=hash_password(password))
        db.add(user)
        db.flush()
        log_action(db, None, "create_admin_cli", "user", user.id, {"login": login})
        results.append((login, password))
    return results


def parse_args(argv):
    """[(login, notify_email or "")]: a word with an @ right after a login is
    that login's notify email, anything else starts a new login."""
    pairs = []
    for token in argv:
        if "@" in token and pairs and pairs[-1][1] == "":
            pairs[-1] = (pairs[-1][0], token)
        else:
            pairs.append((token, ""))
    return pairs


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    pairs = parse_args(argv)
    init_db()  # brings a new database up to the latest schema first
    db = SessionLocal()
    try:
        results = create_admins(db, pairs)
        db.commit()
    finally:
        db.close()
    print("-" * 60)
    for login, password in results:
        if password is None:
            print(f"{login}: already exists, not changed")
        else:
            print(f"{login}: temporary password  {password}")
    print("-" * 60)
    print("Write the passwords down now. They are not shown again.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
