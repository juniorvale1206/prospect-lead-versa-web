/**
 * POST /api/agenda/agendar
 *
 * Cria um agendamento de instalação para um pedido.
 * Rota pública (chamada no checkout ou pelo wizard admin).
 *
 * Body:
 *   orderId       — ID do pedido
 *   storeId       — ID da loja (opcional)
 *   technicianId  — ID do técnico (opcional)
 *   storeSlotId   — ID do slot da loja (obrigatório se storeId informado)
 *   techSlotId    — ID do slot do técnico (obrigatório se technicianId informado)
 *   scheduledDate — "YYYY-MM-DD"
 *   startTime     — "HH:mm"
 *   endTime       — "HH:mm"
 *   clientName    — nome do cliente
 *   clientPhone   — telefone
 *   clientEmail   — e-mail
 *   plate         — placa do veículo
 *   vehicleModel  — modelo do veículo
 *   notes         — observações
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      orderId, storeId, technicianId,
      storeSlotId, techSlotId,
      scheduledDate, startTime, endTime,
      clientName, clientPhone, clientEmail,
      plate, vehicleModel, notes,
    } = body

    if (!orderId || !scheduledDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'orderId, scheduledDate, startTime e endTime são obrigatórios' },
        { status: 400 },
      )
    }

    // Verificar se pedido existe e não tem agendamento
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { appointment: true },
    })
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    if (order.appointment) return NextResponse.json({ error: 'Pedido já possui agendamento' }, { status: 409 })

    // Verificar disponibilidade do slot da loja
    if (storeSlotId) {
      const slot = await prisma.storeSlot.findUnique({ where: { id: storeSlotId } })
      if (!slot) return NextResponse.json({ error: 'Slot da loja não encontrado' }, { status: 404 })
      if (slot.status !== 'AVAILABLE') return NextResponse.json({ error: 'Slot da loja não está disponível' }, { status: 409 })
      if (slot.booked >= slot.capacity) return NextResponse.json({ error: 'Slot da loja está lotado' }, { status: 409 })
    }

    // Verificar disponibilidade do slot do técnico
    if (techSlotId) {
      const slot = await prisma.technicianSlot.findUnique({ where: { id: techSlotId } })
      if (!slot) return NextResponse.json({ error: 'Slot do técnico não encontrado' }, { status: 404 })
      if (slot.status !== 'AVAILABLE') return NextResponse.json({ error: 'Técnico não está disponível neste horário' }, { status: 409 })
    }

    // Criar agendamento em transação
    const appointment = await prisma.$transaction(async (tx) => {
      // Criar o Appointment
      const appt = await tx.appointment.create({
        data: {
          orderId,
          storeId:      storeId      ?? null,
          technicianId: technicianId ?? null,
          scheduledDate: new Date(scheduledDate + 'T00:00:00'),
          startTime,
          endTime,
          status:       'CONFIRMED',
          clientName:   clientName   ?? order.clientName,
          clientPhone:  clientPhone  ?? order.clientPhone,
          clientEmail:  clientEmail  ?? order.clientEmail,
          plate:        plate        ?? order.plate,
          vehicleModel: vehicleModel ?? order.vehicleModel,
          notes:        notes        ?? null,
          confirmedAt:  new Date(),
          tenantId:     order.tenantId,
        },
      })

      // Atualizar slot da loja (incrementar booked)
      if (storeSlotId) {
        await tx.storeSlot.update({
          where: { id: storeSlotId },
          data:  {
            booked:       { increment: 1 },
            status:       'BOOKED',
            appointmentId: appt.id,
          },
        })
      }

      // Marcar slot do técnico como BOOKED
      if (techSlotId) {
        await tx.technicianSlot.update({
          where: { id: techSlotId },
          data:  { status: 'BOOKED', appointmentId: appt.id },
        })
      }

      // Registrar evento no pedido
      await tx.orderEvent.create({
        data: {
          orderId,
          event:   'APPOINTMENT_SCHEDULED',
          payload: JSON.stringify({
            appointmentId: appt.id,
            scheduledDate,
            startTime,
            endTime,
            storeId,
            technicianId,
          }),
        },
      })

      return appt
    })

    return NextResponse.json(appointment, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/agenda/agendar]', err)
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
