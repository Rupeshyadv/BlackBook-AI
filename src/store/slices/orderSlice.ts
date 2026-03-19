import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface OrderFormState {
    step: number
    topic: string
    course: string
    collegeName: string
    instructions: string
    pageCount: number
    hasPPT: boolean
    hasWordFile: boolean
    isRush: boolean
    referenceFileKey: string | null
    totalAmount: number
}

const initialState: OrderFormState = {
    step: 1,
    topic: '',
    course: '',
    collegeName: '',
    instructions: '',
    pageCount: 60,
    hasPPT: false,
    hasWordFile: false,
    isRush: false,
    referenceFileKey: null,
    totalAmount: 999,
}

export const orderSlice = createSlice({
    name: 'order',
    initialState,
    reducers: {
        setStep: (state, action: PayloadAction<number>) => {
            state.step = action.payload
        },
        updateForm: (state, action: PayloadAction<Partial<OrderFormState>>) => {
            return { ...state, ...action.payload }
        },
        resetForm: () => initialState,
    },
})

export const { setStep, updateForm, resetForm } = orderSlice.actions
export const orderReducer = orderSlice.reducer