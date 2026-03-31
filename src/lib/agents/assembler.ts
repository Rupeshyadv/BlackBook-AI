import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, LineRuleType, PageNumber, Footer,
  PageBreak, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, SectionType, VerticalAlign,
} from 'docx'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { db } from '@/lib/db'
import { StyleProfile } from './pdfParser'
import { Outline } from './planner'
import { WriterOutput } from './writer'
import { renderChartToPng } from '@/lib/charts/chartRenderer'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

export async function assembleDocument(
  orderId: string,
  style: StyleProfile,
  outline: Outline,
  writerOutput: WriterOutput,
): Promise<{ docxKey: string | null; pdfKey: string | null }> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  // render chart to PNG
  const chartPng = await renderChartToPng(writerOutput.chartData)

  // build document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: style.font,
            size: style.bodyFontSize,
          },
          paragraph: {
            spacing: {
              line: style.lineSpacing,
              lineRule: LineRuleType.AUTO,
              after: style.paragraphSpacingAfter,
            },
            alignment: AlignmentType.JUSTIFIED,
          }
        }
      }
    },
    sections: [
      buildChapterSection(outline, writerOutput, chartPng, style),
    ]
  })

  const docxBuffer = await Packer.toBuffer(doc)

  // upload DOCX
  const docxKey = `outputs/${orderId}/blackbook.docx`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: docxKey,
    Body: docxBuffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }))

  // convert to PDF via Gotenberg
  let pdfKey: string | null = null
  try {
    const pdfBuffer = await convertToPdf(docxBuffer)
    pdfKey = `outputs/${orderId}/blackbook.pdf`
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }))
    console.log('PDF converted and uploaded:', pdfKey)
  } catch (err) {
    console.error('PDF conversion failed:', err)
  }

  // update document record
  await db.document.update({
    where: { orderId },
    data: { docxKey, pdfKey, generatedAt: new Date(), finalPageCount: order.pageCount }
  })

  return { docxKey, pdfKey }
}

// ─────────────────────────────────────────
// CHAPTERS
// ─────────────────────────────────────────
function buildChapterSection(
  outline: Outline,
  writerOutput: WriterOutput,
  chartPng: Buffer,
  s: StyleProfile,
) {
  const children: Paragraph[] = []

  writerOutput.chapters.forEach((chapter, idx) => {
    const chapterNum = idx + 1

    // CHAPTER NO. heading
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [new TextRun({
          text: `CHAPTER NO. ${chapterNum}`,
          font: s.font,
          size: s.headingFontSize,
          bold: true,
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
        children: [new TextRun({
          text: chapter.title.toUpperCase(),
          font: s.font,
          size: s.headingFontSize,
          bold: true,
        })]
      }),
    )

    // write each section
    chapter.sections.forEach(section => {
      // section heading
      children.push(new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({
          text: section.heading,
          font: s.font,
          size: s.headingFontSize,
          bold: true,
        })]
      }))

      // section paragraphs
      const paras = section.content.split('\n\n').filter(p => p.trim())
      paras.forEach(para => {
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            line: s.lineSpacing,
            lineRule: LineRuleType.AUTO,
            after: s.paragraphSpacingAfter,
          },
          children: [new TextRun({
            text: para.trim(),
            font: s.font,
            size: s.bodyFontSize,
          })]
        }))
      })

      // add chart after analysis section
      if (chapter.type === 'analysis' &&
        section.heading.includes('4.2')) {
        // chart table first
        children.push(
          sp(200),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({
              text: `Table 4.1: ${writerOutput.chartData.title}`,
              font: s.font,
              size: s.bodyFontSize,
              bold: true,
            })]
          }),
          buildDataTable(writerOutput.chartData, s),
          sp(400),
          // chart image
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: chartPng,
                transformation: { width: 480, height: 300 },
                type: 'png',
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({
              text: `Graph 4.1: ${writerOutput.chartData.title}`,
              font: s.font,
              size: s.bodyFontSize,
              bold: true,
              italics: true,
            })]
          }),
          sp(200),
        )
      }
    })

    // REFERENCES at end of each chapter
    children.push(
      sp(200),
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({
          text: 'REFERENCES',
          font: s.font,
          size: s.headingFontSize,
          bold: true,
        })]
      }),
      bp(`[1] Reference relevant to ${chapter.title} and ${outline.topic}.`, s),
      bp(`[2] Reference relevant to ${chapter.title} and ${outline.topic}.`, s),
      bp(`[3] Reference relevant to ${chapter.title} and ${outline.topic}.`, s),
    )

    // page break between chapters
    if (idx < writerOutput.chapters.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  })

  // BIBLIOGRAPHY
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    ph('BIBLIOGRAPHY', s),
    sp(200),
    bp(`1. Books and journals related to ${outline.topic}.`, s),
    bp(`2. Research papers on ${outline.topic}.`, s),
    bp(`3. Websites and online resources consulted during the preparation of this project.`, s),
    sp(200),
    bp('Websites:', s),
    bp('• www.rbi.org.in', s),
    bp('• www.sebi.gov.in', s),
    bp('• www.moneycontrol.com', s),
  )

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        margin: s.margins,
        pageNumbers: { start: 1, formatType: 'decimal' as any }
      }
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: [PageNumber.CURRENT],
            font: s.font,
            size: s.bodyFontSize,
          })]
        })]
      })
    },
    children,
  }
}

// ─────────────────────────────────────────
// TABLES
// ─────────────────────────────────────────
function buildDataTable(chartData: any, s: StyleProfile): Table {
  const headerRow = new TableRow({
    children: [
      tc('Sr. No.', s, true),
      tc('Particulars', s, true),
      tc(`No. of Respondents`, s, true),
      tc(`Percentage (%)`, s, true),
    ]
  })

  const dataRows = chartData.labels.map((label: string, i: number) =>
    new TableRow({
      children: [
        tc(String(i + 1), s),
        tc(label, s),
        tc(String(Math.round(chartData.values[i])), s),
        tc(`${chartData.values[i]}${chartData.unit}`, s),
      ]
    })
  )

  const totalRow = new TableRow({
    children: [
      tc('', s, true),
      tc('Total', s, true),
      tc('100', s, true),
      tc('100%', s, true),
    ]
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, totalRow],
  })
}

// ─────────────────────────────────────────
// GOTENBERG
// ─────────────────────────────────────────
async function convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const formData = new FormData()
  formData.append(
    'files',
    new Blob([docxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }),
    'document.docx'
  )

  const res = await fetch(
    `${process.env.GOTENBERG_URL}/forms/libreoffice/convert`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) throw new Error(`Gotenberg: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function bp(text: string, s?: StyleProfile): Paragraph {
  const font = s?.font ?? 'Times New Roman'
  const size = s?.bodyFontSize ?? 24
  const spacing = s?.lineSpacing ?? 360
  const after = s?.paragraphSpacingAfter ?? 120
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: spacing, lineRule: LineRuleType.AUTO, after },
    children: [new TextRun({ text, font, size })]
  })
}

function ph(text: string, s: StyleProfile): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({
      text,
      font: s.font,
      size: s.headingFontSize,
      bold: true,
    })]
  })
}

function sp(space: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { before: space }
  })
}

function tc(text: string, s: StyleProfile, bold = false): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text,
        font: s.font,
        size: s.bodyFontSize,
        bold,
      })]
    })],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    }
  })
}