"""Erros semânticos do domínio: categorias por significado, sem número HTTP."""

from luc_api.shared.domain.errors import (
    ConflictError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    ValidationError,
)


def test_categorias_descendem_de_domain_error():
    for exc in (NotFoundError, ConflictError, ValidationError, InvalidInputError):
        assert issubclass(exc, DomainError)


def test_domain_error_e_uma_exception():
    assert issubclass(DomainError, Exception)


def test_erro_nao_carrega_numero_http():
    # O status HTTP nasce só na borda (router), nunca no núcleo (ADR-0003).
    err = NotFoundError("Lançamento não encontrado")
    assert not hasattr(err, "status_code")
    assert not hasattr(err, "http_status")


def test_erro_preserva_a_mensagem_semantica():
    assert str(ValidationError("Conta inválida")) == "Conta inválida"
