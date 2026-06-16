"""PDF generation for Lancely invoices and quotations using reportlab."""
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.enums import TA_RIGHT, TA_LEFT


def _fmt_aed(amount):
    try:
        return f"AED {float(amount):,.2f}"
    except Exception:
        return f"AED {amount}"


def _build_document(doc_type: str, doc_data: dict, client_doc: dict, user_doc: dict) -> bytes:
    """Generic generator for invoice/quotation PDFs."""
    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"{doc_type} {doc_data.get('number','')}",
    )

    styles = getSampleStyleSheet()
    h_brand = ParagraphStyle('brand', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, textColor=colors.HexColor('#0E7490'), spaceAfter=2)
    h_doc = ParagraphStyle('docTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=26, textColor=colors.HexColor('#0B0F14'), alignment=TA_RIGHT, spaceAfter=2)
    body = ParagraphStyle('body', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, textColor=colors.HexColor('#0B0F14'), leading=13)
    small = ParagraphStyle('small', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#5B6573'), leading=12)
    muted = ParagraphStyle('muted', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#94A3B8'), leading=12)
    right_small = ParagraphStyle('right_small', parent=small, alignment=TA_RIGHT)
    label = ParagraphStyle('label', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor('#0E7490'), leading=12, spaceAfter=2)

    elements = []

    # Header: brand on left, document title on right
    biz_name = (user_doc.get('business_name') or user_doc.get('name') or 'Lancely').strip()
    biz_lines = [
        Paragraph(biz_name, h_brand),
        Paragraph(user_doc.get('address', '') or '', small),
    ]
    contact_bits = []
    if user_doc.get('email'): contact_bits.append(user_doc['email'])
    if user_doc.get('phone'): contact_bits.append(user_doc['phone'])
    if user_doc.get('website'): contact_bits.append(user_doc['website'])
    if contact_bits:
        biz_lines.append(Paragraph(" · ".join(contact_bits), small))
    if user_doc.get('trn'):
        biz_lines.append(Paragraph(f"TRN: {user_doc['trn']}", small))

    right_lines = [
        Paragraph(doc_type.upper(), h_doc),
        Paragraph(f"<b>{doc_data.get('number','')}</b>", right_small),
    ]
    if doc_data.get('issue_date'):
        right_lines.append(Paragraph(f"Issue Date: {doc_data['issue_date']}", right_small))
    if doc_type.lower() == 'invoice' and doc_data.get('due_date'):
        right_lines.append(Paragraph(f"Due Date: {doc_data['due_date']}", right_small))
    if doc_type.lower() == 'quotation' and doc_data.get('valid_until'):
        right_lines.append(Paragraph(f"Valid Until: {doc_data['valid_until']}", right_small))
    if doc_data.get('status'):
        right_lines.append(Paragraph(f"Status: {doc_data['status'].upper()}", right_small))

    header_tbl = Table([[biz_lines, right_lines]], colWidths=[100 * mm, 74 * mm])
    header_tbl.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 10))
    elements.append(Table([['']], colWidths=[174 * mm], rowHeights=[1], style=TableStyle([('LINEABOVE', (0,0), (-1,0), 0.6, colors.HexColor('#E2E8F0'))])))
    elements.append(Spacer(1, 10))

    # Bill To block
    client_block = [Paragraph('BILL TO' if doc_type.lower() == 'invoice' else 'PREPARED FOR', label)]
    client_block.append(Paragraph(f"<b>{client_doc.get('name','-')}</b>", body))
    if client_doc.get('company'): client_block.append(Paragraph(client_doc['company'], small))
    if client_doc.get('address'): client_block.append(Paragraph(client_doc['address'], small))
    contact = []
    if client_doc.get('email'): contact.append(client_doc['email'])
    if client_doc.get('phone'): contact.append(client_doc['phone'])
    if contact: client_block.append(Paragraph(" · ".join(contact), small))
    if client_doc.get('trn'): client_block.append(Paragraph(f"TRN: {client_doc['trn']}", small))

    title_block = [Paragraph('TITLE', label), Paragraph(doc_data.get('title') or '-', body)]

    info_tbl = Table([[client_block, title_block]], colWidths=[100 * mm, 74 * mm])
    info_tbl.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 14))

    # Items table
    table_data = [[
        Paragraph('<b>Description</b>', body),
        Paragraph('<b>Qty</b>', ParagraphStyle('b', parent=body, alignment=TA_RIGHT)),
        Paragraph('<b>Rate</b>', ParagraphStyle('b', parent=body, alignment=TA_RIGHT)),
        Paragraph('<b>Amount</b>', ParagraphStyle('b', parent=body, alignment=TA_RIGHT)),
    ]]
    for it in (doc_data.get('items') or []):
        qty = float(it.get('quantity', 0) or 0)
        rate = float(it.get('rate', 0) or 0)
        amt = round(qty * rate, 2)
        table_data.append([
            Paragraph(it.get('description', ''), body),
            Paragraph(f"{qty:g}", ParagraphStyle('r', parent=body, alignment=TA_RIGHT)),
            Paragraph(_fmt_aed(rate), ParagraphStyle('r', parent=body, alignment=TA_RIGHT)),
            Paragraph(_fmt_aed(amt), ParagraphStyle('r', parent=body, alignment=TA_RIGHT)),
        ])

    items_tbl = Table(table_data, colWidths=[96 * mm, 16 * mm, 30 * mm, 32 * mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0B0F14')),
        ('LINEBELOW', (0,0), (-1,0), 0.6, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(items_tbl)
    elements.append(Spacer(1, 10))

    # Totals
    subtotal = doc_data.get('subtotal', 0)
    vat = doc_data.get('vat', 0)
    total = doc_data.get('total', 0)
    totals = [
        ['Subtotal', _fmt_aed(subtotal)],
        ['VAT (5%)', _fmt_aed(vat)],
        ['Total', _fmt_aed(total)],
    ]
    totals_tbl = Table(totals, colWidths=[40 * mm, 38 * mm])
    totals_tbl.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONTNAME', (0,0), (-1,1), 'Helvetica'),
        ('FONTNAME', (0,2), (-1,2), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,1), colors.HexColor('#5B6573')),
        ('TEXTCOLOR', (0,2), (-1,2), colors.HexColor('#0B0F14')),
        ('FONTSIZE', (0,0), (-1,1), 10),
        ('FONTSIZE', (0,2), (-1,2), 12),
        ('LINEABOVE', (0,2), (-1,2), 0.6, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    wrap = Table([['', totals_tbl]], colWidths=[96 * mm, 78 * mm])
    wrap.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(wrap)
    elements.append(Spacer(1, 16))

    if doc_data.get('notes'):
        elements.append(Paragraph('NOTES', label))
        elements.append(Paragraph(doc_data['notes'].replace('\n', '<br/>'), small))
        elements.append(Spacer(1, 10))

    elements.append(Spacer(1, 16))
    elements.append(Paragraph('Thank you for your business. · Generated with Lancely', muted))

    pdf.build(elements)
    return buffer.getvalue()


def generate_invoice_pdf(inv: dict, client_doc: dict, user_doc: dict) -> bytes:
    return _build_document('Invoice', inv, client_doc, user_doc)


def generate_quotation_pdf(q: dict, client_doc: dict, user_doc: dict) -> bytes:
    return _build_document('Quotation', q, client_doc, user_doc)
