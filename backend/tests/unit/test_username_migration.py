"""Exercise the additive migration against isolated databases, never app settings."""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.fixture
def migration():
    path = Path(__file__).resolve().parents[2] / "alembic/versions/6d0e3f8a2b4c_add_usernames.py"
    spec = importlib.util.spec_from_file_location("username_migration", path.resolve())
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_preserves_accounts_and_enforces_unique_names(migration):
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)"))
        connection.execute(sa.text("INSERT INTO users VALUES ('one', 'one@example.org'), ('two', 'two@example.org')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(sa.text("SELECT username FROM users ORDER BY id")).scalars().all() == [None, None]
        connection.execute(sa.text("UPDATE users SET username = 'Alice' WHERE id = 'one'"))
        with pytest.raises(sa.exc.IntegrityError):
            with connection.begin_nested():
                connection.execute(sa.text("UPDATE users SET username = 'alice' WHERE id = 'two'"))
        connection.execute(sa.text("UPDATE users SET username = 'bob' WHERE id = 'two'"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert 'username' not in {column['name'] for column in sa.inspect(connection).get_columns('users')}
        assert connection.execute(sa.text("SELECT email FROM users ORDER BY id")).scalars().all() == ['one@example.org', 'two@example.org']
    engine.dispose()


def test_postgres_migration_sql_is_additive(migration):
    from io import StringIO

    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration.upgrade()
    sql = output.getvalue()
    assert "ADD COLUMN username VARCHAR(32)" in sql
    assert "CREATE UNIQUE INDEX uq_users_username_lower ON users (lower(username))" in sql
    assert "NOT NULL" not in sql
    assert "UPDATE users" not in sql
