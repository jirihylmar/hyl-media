---
phase: 5
name: Edit Forms & Polish
status: pending
prerequisites: [phase_4]
output:
  - Inline edit forms for entities
  - Cast/performer management
  - UI polish and responsive design
---

# Phase 5: Edit Forms & Polish

---

## Task 5.1: Entity Edit Forms

**Goal**: Inline editing for name and language on any entity.

**Steps**:
1. Add edit mode to detail pages
2. AppSync mutation to update name, language
3. Write `updated_at` and `updated_by` on save

**Verification**:
- [ ] Can edit a movie name and save
- [ ] `updated_at` and `updated_by` are set
- [ ] Change persists on page reload

---

## Task 5.2: Cast Management on Movie Detail

**Goal**: Add/remove cast members on movie detail page.

**Steps**:
1. Add UI to add actor/director to movie (creates movie_cast entry)
2. Add UI to remove cast member (deletes movie_cast entry)
3. Search/select existing persons

**Verification**:
- [ ] Can add a person to movie cast
- [ ] Can remove a person from cast
- [ ] Changes reflected immediately

---

## Task 5.3: Performer Management on Recording Detail

**Goal**: Add/remove performers on recording detail page.

**Steps**:
1. Add UI to add performer to recording (creates recording_performer entry)
2. Add UI to remove performer
3. Search/select existing bands/artists/persons

**Verification**:
- [ ] Can add a performer to recording
- [ ] Can remove a performer
- [ ] Changes reflected immediately

---

## Task 5.4: UI Polish

**Goal**: Responsive design, consistent styling, navigation polish.

**Steps**:
1. Ensure all pages work on mobile
2. Consistent card/table layouts across entity types
3. Loading states, empty states, error handling
4. Home/dashboard page with overview counts

**Verification**:
- [ ] Responsive on mobile viewport
- [ ] Consistent look across all pages
- [ ] No broken states

---

## Phase Completion Checklist
- [ ] All edit forms working
- [ ] UI polished and responsive
- [ ] Full end-to-end test: browse → view → edit → save → verify
- [ ] Git committed
- [ ] Deployed to Amplify Hosting
