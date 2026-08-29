import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Page from '@/app/page'

test('ホームページは見出しと主要導線のリンクを表示する', () => {
  render(<Page />)

  expect(
    screen.getByRole('heading', { level: 1, name: /To get started, edit the page\.tsx file\./ }),
  ).toBeDefined()
  expect(screen.getByRole('link', { name: /Deploy Now/ })).toBeDefined()
  expect(screen.getByRole('link', { name: /Documentation/ })).toBeDefined()
})
