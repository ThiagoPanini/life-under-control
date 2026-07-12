"""Clock: o SystemClock afirma a forma (data civil ISO no fuso do Lar); o
FixedClock devolve sempre a data injetada (Seam 1)."""

import re

from luc_api.shared.adapters.system_clock import system_clock
from luc_api.shared.application.clock import FixedClock
from luc_api.shared.domain.civil_date import eh_data_iso_valida


def test_hoje_devolve_data_civil_iso_valida():
    # Relógio real: não cravamos o valor, afirmamos a forma (YYYY-MM-DD válida).
    hoje = system_clock().hoje()
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", hoje)
    assert eh_data_iso_valida(hoje)


def test_fixed_clock_devolve_a_data_injetada():
    assert FixedClock("2026-07-10").hoje() == "2026-07-10"
