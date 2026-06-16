"""PDF generation for Lancely invoices and quotations (reportlab).

Organized into small builder helpers so each section is independently
testable and readable.
"""
from io import BytesIO
from typing import List

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_RIGHT


# ---------- formatting helpers ----------

def _fmt_money(amount, currency: str = "AED") -> str:
    try:
        return f"{currency} {float(amount):,.2f}"
    except Exception:
        return f"{currency} {amount}"


# ---------- styles ----------

def _build_styles():
    styles = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle('brand', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, textColor=colors.HexColor('#0E7490'), spaceAfter=2),
        "doc_title": ParagraphStyle('docTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=26, textColor=colors.HexColor('#0B0F14'), alignment=TA_RIGHT, spaceAfter=2),
        "body": ParagraphStyle('body', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, textColor=colors.HexColor('#0B0F14'), leading=13),
        "small": ParagraphStyle('small', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#5B6573'), leading=12),
        "muted": ParagraphStyle('muted', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#94A3B8'), leading=12),
        "right_small": ParagraphStyle('right_small', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#5B6573'), leading=12, alignment=TA_RIGHT),
        "label": ParagraphStyle('label', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#0E7490'), leading=12, spaceAfter=2),
    }


# ---------- section builders ----------

def _build_header(doc_type: str, doc_data: dict, user_doc: dict, S: dict):
    biz_name = (user_doc.get('business_name') or user_doc.get('name') or 'Lancely').strip()
    biz_lines = [Paragraph(biz_name, S["brand"])]
    if user_doc.get('address'):
        biz_lines.append(Paragraph(user_doc['address'], S["small"]))
    contact_bits = [v for v in [user_doc.get('email'), user_doc.get('phone'), user_doc.get('website')] if v]
    if contact_bits:
        biz_lines.append(Paragraph(" \u00b7 ".join(contact_bits), S["small"]))
    if user_doc.get('trn'):
        biz_lines.append(Paragraph(f"TRN: {user_doc['trn']}", S["small"]))

    right_lines = [
        Paragraph(doc_type.upper(), S["doc_title"]),
        Paragraph(f"<b>{doc_data.get('number', '')}</b>", S["right_small"]),
    ]
    if doc_data.get('issue_date'):
        right_lines.append(Paragraph(f"Issue Date: {doc_data['issue_date']}", S["right_small"]))
    if doc_type.lower() == 'invoice' and doc_data.get('due_date'):
        right_lines.append(Paragraph(f"Due Date: {doc_data['due_date']}", S["right_small"]))
    if doc_type.lower() == 'quotation' and doc_data.get('valid_until'):
        right_lines.append(Paragraph(f"Valid Until: {doc_data['valid_until']}", S["right_small"]))
    if doc_data.get('status'):
        right_lines.append(Paragraph(f"Status: {doc_data['status'].upper()}", S["right_small"]))

    tbl = Table([[biz_lines, right_lines]], colWidths=[100 * mm, 74 * mm])
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _build_parties_block(doc_type: str, doc_data: dict, client_doc: dict, S: dict):
    label = 'BILL TO' if doc_type.lower() == 'invoice' else 'PREPARED FOR'
    client_block = [Paragraph(label, S["label"]), Paragraph(f"<b>{client_doc.get('name', '-')}</b>", S["body"])]
    if client_doc.get('company'):
        client_block.append(Paragraph(client_doc['company'], S["small"]))
    if client_doc.get('address'):
        client_block.append(Paragraph(client_doc['address'], S["small"]))
    contact = [v for v in [client_doc.get('email'), client_doc.get('phone')] if v]
    if contact:
        client_block.append(Paragraph(" \u00b7 ".join(contact), S["small"]))
    if client_doc.get('trn'):
        client_block.append(Paragraph(f"TRN: {client_doc['trn']}", S["small"]))

    title_block = [Paragraph('TITLE', S["label"]), Paragraph(doc_data.get('title') or '-', S["body"])]
    info_tbl = Table([[client_block, title_block]], colWidths=[100 * mm, 74 * mm])
    info_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return info_tbl


def _build_items_table(items: List[dict], currency: str, S: dict):
    right_body = ParagraphStyle('r', parent=S["body"], alignment=TA_RIGHT)
    header = [
        Paragraph('<b>Description</b>', S["body"]),
        Paragraph('<b>Qty</b>', right_body),
        Paragraph('<b>Rate</b>', right_body),
        Paragraph('<b>Amount</b>', right_body),
    ]
    rows = [header]
    for it in (items or []):
        qty = float(it.get('quantity', 0) or 0)
        rate = float(it.get('rate', 0) or 0)
        amt = round(qty * rate, 2)
        rows.append([
            Paragraph(it.get('description', ''), S["body"]),
            Paragraph(f"{qty:g}", right_body),
            Paragraph(_fmt_money(rate, currency), right_body),
            Paragraph(_fmt_money(amt, currency), right_body),
        ])
    tbl = Table(rows, colWidths=[96 * mm, 16 * mm, 30 * mm, 32 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0B0F14')),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return tbl


def _build_totals_block(doc_data: dict, currency: str):
    rows = [
        ['Subtotal', _fmt_money(doc_data.get('subtotal', 0), currency)],
        ['VAT (5%)', _fmt_money(doc_data.get('vat', 0), currency)],
        ['Total', _fmt_money(doc_data.get('total', 0), currency)],
    ]
    inner = Table(rows, colWidths=[40 * mm, 38 * mm])
    inner.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 1), 'Helvetica'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (-1, 1), colors.HexColor('#5B6573')),
        ('TEXTCOLOR', (0, 2), (-1, 2), colors.HexColor('#0B0F14')),
        ('FONTSIZE', (0, 0), (-1, 1), 10),
        ('FONTSIZE', (0, 2), (-1, 2), 12),
        ('LINEABOVE', (0, 2), (-1, 2), 0.6, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    wrap = Table([['', inner]], colWidths=[96 * mm, 78 * mm])
    wrap.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return wrap


def _build_notes_and_footer(doc_data: dict, S: dict):
    blocks = []
    if doc_data.get('notes'):
        blocks.append(Paragraph('NOTES', S["label"]))
        blocks.append(Paragraph(doc_data['notes'].replace('\n', '<br/>'), S["small"]))
        blocks.append(Spacer(1, 10))
    blocks.append(Spacer(1, 16))
    blocks.append(Paragraph('Thank you for your business. \u00b7 Generated with Lancely', S["muted"]))
    return blocks


# ---------- main entry points ----------

def _build_document(doc_type: str, doc_data: dict, client_doc: dict, user_doc: dict) -> bytes:
    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"{doc_type} {doc_data.get('number', '')}",
    )
    S = _build_styles()
    currency = doc_data.get('currency') or 'AED'

    elements = []
    elements.append(_build_header(doc_type, doc_data, user_doc, S))
    elements.append(Spacer(1, 10))
    elements.append(Table([['']], colWidths=[174 * mm], rowHeights=[1],
                          style=TableStyle([('LINEABOVE', (0, 0), (-1, 0), 0.6, colors.HexColor('#E2E8F0'))])))
    elements.append(Spacer(1, 10))
    elements.append(_build_parties_block(doc_type, doc_data, client_doc, S))
    elements.append(Spacer(1, 14))
    elements.append(_build_items_table(doc_data.get('items') or [], currency, S))
    elements.append(Spacer(1, 10))
    elements.append(_build_totals_block(doc_data, currency))
    elements.append(Spacer(1, 16))
    elements.extend(_build_notes_and_footer(doc_data, S))

    pdf.build(elements)
    return buffer.getvalue()


def generate_invoice_pdf(inv: dict, client_doc: dict, user_doc: dict) -> bytes:
    return _build_document('Invoice', inv, client_doc, user_doc)


def generate_quotation_pdf(q: dict, client_doc: dict, user_doc: dict) -> bytes:
    return _build_document('Quotation', q, client_doc, user_doc)
