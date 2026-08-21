import re

from pydantic import BaseModel, Field, field_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")
FILE_KINDS = {"doc", "decision-tree", "quiz"}
VISIBILITIES = {"public", "private"}


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not USERNAME_RE.match(v):
            raise ValueError("username must be 3-20 characters: letters, digits, underscore")
        return v.lower()


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=1, max_length=200)


# ---- profiles ---------------------------------------------------------

class SocialLinkIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    url: str = Field(min_length=1, max_length=500)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        return v


class ProfileUpdate(BaseModel):
    bio_markdown: str = Field(max_length=20_000)


class SocialLinksUpdate(BaseModel):
    links: list[SocialLinkIn] = Field(max_length=20)


# ---- files --------------------------------------------------------------

def _check_kind(v: str) -> str:
    if v not in FILE_KINDS:
        raise ValueError(f"kind must be one of {sorted(FILE_KINDS)}")
    return v


def _check_visibility(v: str) -> str:
    if v not in VISIBILITIES:
        raise ValueError(f"visibility must be one of {sorted(VISIBILITIES)}")
    return v


class FileCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="doc")
    visibility: str = Field(default="private")
    content: str = Field(default="", max_length=500_000)

    _validate_kind = field_validator("kind")(_check_kind)
    _validate_visibility = field_validator("visibility")(_check_visibility)


class FileMetaUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: str
    visibility: str

    _validate_kind = field_validator("kind")(_check_kind)
    _validate_visibility = field_validator("visibility")(_check_visibility)


class RevisionCreate(BaseModel):
    content: str = Field(max_length=500_000)
    message: str = Field(default="", max_length=500)
    parent_revision_id: int = Field(
        description="Head revision id this edit was based on, for optimistic concurrency."
    )


class SuggestionCreate(BaseModel):
    content: str = Field(max_length=500_000)
    message: str = Field(default="", max_length=500)
    base_revision_id: int


class CollaboratorAdd(BaseModel):
    username: str
