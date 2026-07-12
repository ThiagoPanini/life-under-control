"""Erros semânticos do domínio: categorias por significado, nunca por status HTTP.

O número HTTP nasce só na borda (router), traduzindo estas categorias; o núcleo
não conhece protocolo (ADR-0003). Cada Área deriva erros nomeados destas raízes.
"""


class DomainError(Exception):
    """Raiz dos erros de domínio do LUC — semântica, sem acoplamento a HTTP."""


class NotFoundError(DomainError):
    """Um recurso esperado não existe no Lar (id inexistente ou de outro Lar)."""


class ConflictError(DomainError):
    """A operação conflita com o estado/invariante atual (duplicidade, unicidade)."""


class ValidationError(DomainError):
    """A entrada não passou na validação de domínio."""


class InvalidInputError(DomainError):
    """A entrada é malformada ou inaceitável (formato, faixa, tipo)."""
