// Box.asm - "Make the Computer Draw a Box" (K = 39)
//
// Behaviour
//   Key held down (KBD != 0)  -> paint a solid black box (-1 = 1111111111111111)
//   Key released  (KBD == 0)  -> paint the same area white (0)
//
// Geometry for K = 39
//   start row   = 39                         (rows counted from the top)
//   start addr  = SCREEN + 32 * 39           = 16384 + 1248 = 17632
//   height      = 20 rows                    (rows 39 to 58)
//   width       = 4 words per row            (16 * ((39 mod 4) + 1) = 64 pixels)
//
// Screen layout: 512 pixels wide = 32 words per row.
// Moving down one pixel row means adding 32 to the address.
//
// RAM variables (assigned by assembler.py in order of first use, from RAM[16]):
//   color       RAM[16]  colour to paint (0 = white, -1 = black)
//   row_addr    RAM[17]  screen address of the first word of the current row
//   rows_left   RAM[18]  rows still to paint
//   ptr         RAM[19]  screen address being written right now
//   words_left  RAM[20]  words still to paint in the current row

// ---------- Main loop: poll the keyboard ----------
(MAIN_LOOP)
    @KBD
    D=M                 // D = key code (0 when no key is pressed)
    @KEY_DOWN
    D;JNE               // a key is pressed -> paint black

    // No key pressed -> colour = white
    @color
    M=0                 // 0 = all bits clear = white
    @DRAW
    0;JMP

(KEY_DOWN)
    @color
    M=-1                // -1 = all 16 bits set = black

// ---------- Paint the box in the current colour ----------
(DRAW)
    // row_addr = SCREEN + 32 * 39 (top-left word of the box)
    @SCREEN
    D=A
    @1248               // 32 * 39: row offset for the start row
    D=D+A
    @row_addr
    M=D

    // rows_left = 20
    @20
    D=A
    @rows_left
    M=D

(ROW_LOOP)
    // No rows left -> the box is finished, go back and poll the keyboard
    @rows_left
    D=M
    @MAIN_LOOP
    D;JEQ

    // Start this row: ptr = row_addr, words_left = 4
    @row_addr
    D=M
    @ptr
    M=D
    @4
    D=A
    @words_left
    M=D

(COL_LOOP)
    // No words left in this row -> go to the next row
    @words_left
    D=M
    @NEXT_ROW
    D;JEQ

    // RAM[ptr] = color
    @color
    D=M
    @ptr
    A=M
    M=D

    // ptr = ptr + 1 and words_left = words_left - 1
    @ptr
    M=M+1
    @words_left
    M=M-1

    @COL_LOOP
    0;JMP

(NEXT_ROW)
    // row_addr = row_addr + 32 (move down one pixel row)
    @32
    D=A
    @row_addr
    M=M+D

    // rows_left = rows_left - 1
    @rows_left
    M=M-1

    @ROW_LOOP
    0;JMP
