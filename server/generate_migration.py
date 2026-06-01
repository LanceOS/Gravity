import pty
import os
import sys
import time
import select

def main():
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("npm", ["npm", "run", "db:generate"])
    else:
        while True:
            try:
                r, _, _ = select.select([fd], [], [], 0.5)
                if r:
                    output = os.read(fd, 1024).decode('utf-8')
                    sys.stdout.write(output)
                    sys.stdout.flush()
                    if "Is user_external_credentials table created" in output:
                        os.write(fd, b"\r")
                    if "Is note_metadata table created" in output:
                        os.write(fd, b"\r")
                    if "Is note_metadata table renamed" in output:
                        os.write(fd, b"\r")
                    if "created or renamed" in output:
                        os.write(fd, b"\r")
            except OSError:
                break
        
        _, status = os.waitpid(pid, 0)
        sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else status >> 8)

if __name__ == "__main__":
    main()
