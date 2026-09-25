'use client'

import type { JSONFieldClientProps } from 'payload'

import {
  Banner,
  Button,
  FieldDescription,
  FieldLabel,
  useConfig,
  useDocumentInfo,
  useField,
  useFormFields,
  useTranslation,
} from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import type {
  EntityType,
  GovernedEntity,
  PermissionMatrix,
  PermissionsMatrixClientProps,
  RbacOperation,
} from '../../types.js'

import { COLLECTION_OPERATIONS } from '../../utilities/constants.js'
import { emptyMatrix, sanitizeMatrix } from '../../utilities/matrix.js'
import styles from './index.module.css'

type Props = JSONFieldClientProps & PermissionsMatrixClientProps

type Row = {
  label: string
} & GovernedEntity

type CheckState = 'all' | 'none' | 'some'

const OPERATION_LABELS: Record<RbacOperation, string> = {
  create: 'Create',
  delete: 'Delete',
  read: 'Read',
  update: 'Update',
}

const resolveLabel = (label: unknown, language: string, fallback: string): string => {
  if (typeof label === 'string' && label.length > 0) {
    return label
  }

  if (label && typeof label === 'object') {
    const translations = label as Record<string, unknown>
    const match = translations[language] ?? translations.en ?? Object.values(translations)[0]

    if (typeof match === 'string') {
      return match
    }
  }

  return toWords(fallback)
}

const stateOf = (values: boolean[]): CheckState => {
  const granted = values.filter(Boolean).length

  if (granted === 0) {
    return 'none'
  }

  return granted === values.length ? 'all' : 'some'
}

type CheckboxProps = {
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
  state: CheckState
  variant?: 'cell' | 'toggle'
}

const Checkbox: React.FC<CheckboxProps> = ({
  disabled,
  label,
  onChange,
  state,
  variant = 'cell',
}) => {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'some'
    }
  }, [state])

  return (
    <label
      className={[styles.checkbox, variant === 'toggle' ? styles.checkboxToggle : '']
        .filter(Boolean)
        .join(' ')}
      title={label}
    >
      <input
        aria-label={label}
        checked={state === 'all'}
        className={styles.input}
        disabled={disabled}
        onChange={() => onChange(state !== 'all')}
        ref={ref}
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.box} />
    </label>
  )
}

type SectionProps = {
  disabled: boolean
  matrix: PermissionMatrix
  onChange: (updater: (draft: PermissionMatrix) => void) => void
  rows: Row[]
  title: string
  type: EntityType
}

const Section: React.FC<SectionProps> = ({ type, disabled, matrix, onChange, rows, title }) => {
  const operations = COLLECTION_OPERATIONS
  const isGranted = (slug: string, operation: RbacOperation) =>
    matrix[type][slug]?.[operation] === true

  const setGrant = (draft: PermissionMatrix, row: Row, operation: RbacOperation, next: boolean) => {
    if (!row.operations.includes(operation)) {
      return
    }

    const grants = { ...(draft[type][row.slug] ?? {}) }

    if (next) {
      grants[operation] = true
    } else {
      delete grants[operation]
    }

    if (Object.keys(grants).length === 0) {
      delete draft[type][row.slug]
    } else {
      draft[type][row.slug] = grants
    }
  }

  const allCells = rows.flatMap((row) =>
    row.operations.map((operation) => isGranted(row.slug, operation)),
  )

  return (
    <section className={styles.section}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.nameHeader} scope="col">
                <div className={styles.sectionTitle}>
                  <Checkbox
                    disabled={disabled || rows.length === 0}
                    label={`Toggle every ${title.toLowerCase()} permission`}
                    onChange={(next) =>
                      onChange((draft) =>
                        rows.forEach((row) =>
                          row.operations.forEach((operation) =>
                            setGrant(draft, row, operation, next),
                          ),
                        ),
                      )
                    }
                    state={stateOf(allCells)}
                    variant="toggle"
                  />
                  <span>{title}</span>
                  <span className={styles.count}>{rows.length}</span>
                </div>
              </th>
              {operations.map((operation) => {
                const applicable = rows.filter((row) => row.operations.includes(operation))
                const column = applicable.map((row) => isGranted(row.slug, operation))
                const unsupported = rows.length > 0 && applicable.length === 0

                return (
                  <th className={styles.operationHeader} key={operation} scope="col">
                    <div className={styles.operationHeaderInner}>
                      <span className={unsupported ? styles.muted : undefined}>
                        {OPERATION_LABELS[operation]}
                      </span>
                      {unsupported ? (
                        <span aria-hidden="true" className={styles.placeholder} />
                      ) : (
                        <Checkbox
                          disabled={disabled || column.length === 0}
                          label={`Toggle ${OPERATION_LABELS[operation].toLowerCase()} for all ${title.toLowerCase()}`}
                          onChange={(next) =>
                            onChange((draft) =>
                              rows.forEach((row) => setGrant(draft, row, operation, next)),
                            )
                          }
                          state={stateOf(column)}
                          variant="toggle"
                        />
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowValues = row.operations.map((operation) => isGranted(row.slug, operation))
              const rowState = stateOf(rowValues)

              return (
                <tr className={rowState !== 'none' ? styles.rowActive : undefined} key={row.slug}>
                  <th className={styles.nameCell} scope="row">
                    <div className={styles.nameInner}>
                      <Checkbox
                        disabled={disabled}
                        label={`Toggle every permission for ${row.label}`}
                        onChange={(next) =>
                          onChange((draft) =>
                            row.operations.forEach((operation) =>
                              setGrant(draft, row, operation, next),
                            ),
                          )
                        }
                        state={rowState}
                        variant="toggle"
                      />
                      <span className={styles.nameText}>
                        <span className={styles.label}>{row.label}</span>
                        <code className={styles.slug}>{row.slug}</code>
                      </span>
                    </div>
                  </th>
                  {operations.map((operation) => (
                    <td className={styles.cell} key={operation}>
                      {row.operations.includes(operation) ? (
                        <Checkbox
                          disabled={disabled}
                          label={`${OPERATION_LABELS[operation]} ${row.label}`}
                          onChange={(next) =>
                            onChange((draft) => setGrant(draft, row, operation, next))
                          }
                          state={isGranted(row.slug, operation) ? 'all' : 'none'}
                        />
                      ) : (
                        <span
                          className={styles.notApplicable}
                          title={`${OPERATION_LABELS[operation]} does not apply to globals`}
                        >
                          <span aria-hidden="true">—</span>
                          <span className={styles.srOnly}>
                            {`${OPERATION_LABELS[operation]} does not apply to globals`}
                          </span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td className={styles.empty} colSpan={operations.length + 1}>
                  No {title.toLowerCase()} match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export const PermissionsMatrix: React.FC<Props> = (props) => {
  const { entities, field, path, readOnly } = props
  const { i18n } = useTranslation()
  const { config } = useConfig()
  const { initialData } = useDocumentInfo()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const { setValue, value } = useField<unknown>({ path })
  const isSuperAdminField = useFormFields(([fields]) => fields?.isSuperAdmin?.value)
  const isSuperAdmin = isSuperAdminField === true || initialData?.isSuperAdmin === true

  const matrix = useMemo(() => sanitizeMatrix(value ?? emptyMatrix(), entities), [value, entities])

  const rows = useMemo(() => {
    const language = i18n.language
    const collections: Row[] = entities.collections.map((entity) => {
      const collection = config.collections.find(({ slug }) => slug === entity.slug)
      return {
        ...entity,
        label: resolveLabel(collection?.labels?.plural, language, entity.slug),
      }
    })
    const globals: Row[] = entities.globals.map((entity) => {
      const global = config.globals.find(({ slug }) => slug === entity.slug)
      return { ...entity, label: resolveLabel(global?.label, language, entity.slug) }
    })

    return { collections, globals }
  }, [config.collections, config.globals, entities, i18n.language])

  const filter = useCallback(
    (list: Row[]) => {
      const term = query.trim().toLowerCase()
      return term
        ? list.filter(
            (row) =>
              row.label.toLowerCase().includes(term) || row.slug.toLowerCase().includes(term),
          )
        : list
    },
    [query],
  )

  const update = useCallback(
    (updater: (draft: PermissionMatrix) => void) => {
      const draft: PermissionMatrix = {
        collections: { ...matrix.collections },
        globals: { ...matrix.globals },
      }
      updater(draft)
      setValue(sanitizeMatrix(draft, entities))
    },
    [entities, matrix, setValue],
  )

  const total =
    entities.collections.reduce((sum, entity) => sum + entity.operations.length, 0) +
    entities.globals.reduce((sum, entity) => sum + entity.operations.length, 0)
  const granted =
    Object.values(matrix.collections).reduce((sum, grants) => sum + Object.keys(grants).length, 0) +
    Object.values(matrix.globals).reduce((sum, grants) => sum + Object.keys(grants).length, 0)

  const disabled = Boolean(readOnly)
  const label = field?.label ?? 'Permissions'

  const setAll = (next: boolean) =>
    setValue(
      next
        ? sanitizeMatrix(
            {
              collections: Object.fromEntries(
                entities.collections.map((entity) => [
                  entity.slug,
                  Object.fromEntries(entity.operations.map((operation) => [operation, true])),
                ]),
              ),
              globals: Object.fromEntries(
                entities.globals.map((entity) => [
                  entity.slug,
                  Object.fromEntries(entity.operations.map((operation) => [operation, true])),
                ]),
              ),
            },
            entities,
          )
        : emptyMatrix(),
    )

  if (isSuperAdmin) {
    return (
      <div className={`field-type ${styles.root}`}>
        <FieldLabel as="h3" label={label} path={path} />
        <Banner type="success">
          This is the Super Admin role. It has full access to every collection and global, so its
          permissions cannot be edited.
        </Banner>
      </div>
    )
  }

  const collectionRows = filter(rows.collections)
  const globalRows = filter(rows.globals)

  return (
    <div className={`field-type ${styles.root}`}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <FieldLabel as="h3" label={label} path={path} />
          <FieldDescription
            description={
              field?.admin?.description ??
              'Choose what users with this role can do. Collections and globals added to your config appear here automatically.'
            }
            path={path}
          />
        </div>
        <div aria-live="polite" className={styles.summary}>
          <span className={styles.summaryValue}>{granted}</span>
          <span className={styles.summaryTotal}>/ {total} granted</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor={searchId}>
          <span className={styles.srOnly}>Filter collections and globals</span>
          <input
            aria-label="Filter collections and globals"
            autoComplete="off"
            className={styles.searchInput}
            id={searchId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name or slug"
            type="search"
            value={query}
          />
        </label>
        <div className={styles.actions}>
          <Button
            buttonStyle="secondary"
            disabled={disabled || granted === total}
            margin={false}
            onClick={() => setAll(true)}
            size="small"
          >
            Grant all
          </Button>
          <Button
            buttonStyle="secondary"
            disabled={disabled || granted === 0}
            margin={false}
            onClick={() => setAll(false)}
            size="small"
          >
            Revoke all
          </Button>
        </div>
      </div>

      <Section
        disabled={disabled}
        matrix={matrix}
        onChange={update}
        rows={collectionRows}
        title="Collections"
        type="collections"
      />

      {entities.globals.length > 0 && (
        <Section
          disabled={disabled}
          matrix={matrix}
          onChange={update}
          rows={globalRows}
          title="Globals"
          type="globals"
        />
      )}
    </div>
  )
}
