import board
import busio
import time

i2c0 = busio.I2C(board.GP13, board.GP12)
i2c1 = busio.I2C(board.GP19, board.GP18)


def scan(name, i2c):
    while not i2c.try_lock():
        pass

    try:
        addresses = i2c.scan()
        print(name, [hex(address) for address in addresses])
    finally:
        i2c.unlock()


while True:
    scan("I2C0", i2c0)
    scan("I2C1", i2c1)
    print()
    time.sleep(2)