export type Payload = {
    message: string
}

export function getTestPayload(): Payload {
    return { message: 'nobody in the club gettin tipsy' }
}

export function checkSecret(): Payload {
    let message = process.env.REDIS_PW==='MyRedisPassword1234'?"Secret Correct":"Secret Wrong";
    return { message }
}
