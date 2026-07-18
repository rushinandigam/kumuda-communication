"""merge multiple heads into single linear chain

Revision ID: merge001
Revises: a1c2d3e4f5g6, b7e3c9a1d2f4, cdcf9f65913b
Create Date: 2026-07-18 00:00:00.000000

"""

from typing import Sequence, Union

revision: str = "merge001"
down_revision = ("a1c2d3e4f5g6", "b7e3c9a1d2f4", "cdcf9f65913b")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
