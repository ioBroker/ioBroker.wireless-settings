# Add to /etc/sudoers.d/iobroker the "iobroker ALL=(ALL) NOPASSWD: /usr/bin/nmcli"
# Define the line to check/add
LINE="iobroker ALL=(ALL) NOPASSWD: /usr/bin/nmcli"
FILE="/etc/sudoers.d/iobroker"
# Check if the line is already in the file
if ! grep -Fxq "$LINE" "$FILE"; then
    # If not, add the line to the file
    echo "$LINE" | sudo tee -a "$FILE"
    echo "nmcli added to $FILE"
else
    echo "nmcli already exists in $FILE"
fi
