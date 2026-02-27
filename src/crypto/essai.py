import socket
import time

NODE_ID = "0xabc123..."   # Remplacer par l’ID généré
NODE_PORT = 7777
BROADCAST_PORT = 5005

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

message = f"Salut, je suis {NODE_ID} et mon port est {NODE_PORT}"

while True:
    sock.sendto(message.encode(), ('<broadcast>', BROADCAST_PORT))
    print("Message envoyé :", message)
    time.sleep(30)
    