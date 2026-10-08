import asyncio
import errno
import os
import socket

# Network families are refused by name; local streams are served.
for family in (socket.AF_INET, socket.AF_INET6):
    try:
        socket.socket(family, socket.SOCK_STREAM)
        raise AssertionError("a network socket was created")
    except OSError as error:
        assert error.errno == errno.EAFNOSUPPORT, error

left, right = socket.socketpair()
left.sendall(b"pair")
assert right.recv(4) == b"pair"


# asyncio's loop wakes itself through a socket pair; a server and a client
# meet at a path, which the server removes when it closes.
async def main(path):
    async def serve(reader, writer):
        writer.write((await reader.readline()).upper())
        await writer.drain()
        writer.close()

    server = await asyncio.start_unix_server(serve, path)
    reader, writer = await asyncio.open_unix_connection(path)
    writer.write(b"ping\n")
    assert await reader.readline() == b"PING\n"
    writer.close()
    await writer.wait_closed()
    server.close()
    await server.wait_closed()
    assert not os.path.exists(path)


asyncio.run(main("python-sockets.sock"))
print("PYTHON-SOCKETS-OK")
