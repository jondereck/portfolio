import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { formatZodFieldErrors } from '@/lib/server/request-parsing';
import { ObjectStorageError } from '@/lib/server/object-storage';
import { RequestValidationError } from '@/lib/server/uploads';
import { createFormErrorResponse } from '@/lib/server/form-responses';

export function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof RequestValidationError) {
    const duplicate = (error.meta as { duplicate?: unknown } | undefined)?.duplicate;
    return createFormErrorResponse(
      {
        error: error.message,
        errorCode: error.errorCode,
        fieldErrors: error.details,
        // Surface the duplicate (incl. which album owns it) at the top level so the
        // client error object exposes `error.duplicate` directly.
        ...(duplicate ? { duplicate } : {}),
        details: {
          ...(error.details ? { validation: error.details } : {}),
          ...(error.meta ?? {}),
        },
      },
      error.status,
    );
  }

  if (error instanceof ObjectStorageError) {
    return createFormErrorResponse(
      {
        error: error.message,
        errorCode: error.errorCode,
      },
      error.status,
    );
  }

  if (error instanceof z.ZodError) {
    const fieldErrors = formatZodFieldErrors(error);
    return createFormErrorResponse(
      {
        error: Object.values(fieldErrors)[0]?.[0] || 'Validation failed.',
        errorCode: 'INVALID_PAYLOAD',
        fieldErrors,
      },
      400,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
      if (target.includes('albumId') && target.includes('contentHash')) {
        return NextResponse.json(
          {
            error: 'Duplicate media already exists in this album.',
            errorCode: 'DUPLICATE_MEDIA',
          },
          { status: 409 },
        );
      }

      if (target.includes('albumId') && target.includes('sourceId')) {
        return NextResponse.json(
          {
            error: 'This Google Drive media already exists in the selected album.',
            errorCode: 'DUPLICATE_SOURCE_MEDIA',
          },
          { status: 409 },
        );
      }

      if (target.includes('email')) {
        return createFormErrorResponse(
          {
            error: 'That email is already in use.',
            errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
            fieldErrors: {
              email: ['That email is already in use.'],
            },
            details: { target },
          },
          409,
        );
      }

      if (target.length === 1) {
        const field = target[0];
        const message = `A record with this ${field} already exists.`;
        return createFormErrorResponse(
          {
            error: message,
            errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
            fieldErrors: {
              [field]: [message],
            },
            details: { target },
          },
          409,
        );
      }

      return NextResponse.json(
        {
          error: 'A record with the same unique field already exists.',
          errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
        },
        { status: 409 },
      );
    }

    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Record not found.', errorCode: 'RECORD_NOT_FOUND' }, { status: 404 });
    }
  }

  if (error instanceof Error && /body|payload|entity/i.test(error.message) && /large|too\s+big|too\s+large|exceeded/i.test(error.message)) {
    return NextResponse.json({ error: 'Request body is too large.', errorCode: 'REQUEST_BODY_TOO_LARGE' }, { status: 413 });
  }

  console.error(error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
